/* Copyright 2019 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import { GOOGLE_COLORS, Shape } from "./colors.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { Client } from "../../client/modules/module_interface.ts";
import { ModuleWS } from "../../lib/websocket.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";

interface ClientShape {
  palette: number[];
  oldx: number;
  oldy: number;
  positions: Array<[number, number]>;
}

export function load(network: ModuleWS, wallGeometry: Polygon) {
  // Maximum value in a particular pixel.
  const MAX_VALUE = 32;

  class ChaosClient extends Client {
    // The server layout
    shapes: Shape[] = [];
    clientshape: ClientShape[] = [];

    // When we are good to draw and this doesn't match 'time', we blank the canvas.
    oldtime = 0;

    // The number of the server layout, monotonically increasing.
    time = -Infinity;

    canvas!: CanvasRenderingContext2D;
    imageData!: ImageData;
    raw: number[] = [];

    constructor() {
      super();

      network.on("chaos", (data) => {
        // If the server has chosen a new layout, update the client layout.
        if (this.time != data.time) {
          this.time = data.time;
          this.shapes = data.shapes;
          this.clientshape = [];
        }
      });
    }

    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    willBeShownSoon(container: HTMLElement) {
      const surface = new CanvasSurface(container, wallGeometry);
      this.surface = surface;
      this.canvas = surface.context;
      this.imageData = this.canvas.getImageData(
        0,
        0,
        this.surface.virtualRect.w,
        this.surface.virtualRect.h,
      );
      this.raw = new Array(
        this.surface.virtualRect.w * this.surface.virtualRect.h,
      ).fill(0);
    }

    initialize() {
      this.canvas.fillStyle = "black";
      this.canvas.fillRect(
        0,
        0,
        this.surface!.virtualRect.w,
        this.surface!.virtualRect.h,
      );
      this.raw.fill(0);
      let i = 0;
      for (let y = 0; y < this.surface!.virtualRect.h; ++y) {
        for (let x = 0; x < this.surface!.virtualRect.w; ++x) {
          this.imageData.data[i++] = 0;
          this.imageData.data[i++] = 0;
          this.imageData.data[i++] = 0;
          this.imageData.data[i++] = 255;
        }
      }
    }

    // Sets a pixel in the canvas to the color associated with the specified shape.
    setPixel(x: number, y: number, shape: number) {
      const surface = this.surface!;
      x -= surface.virtualRect.x;
      y -= surface.virtualRect.y;
      if (
        (x < 0) || (y < 0) || (x >= surface.virtualRect.w) ||
        (y >= surface.virtualRect.h)
      ) return;
      x = Math.floor(x);
      y = Math.floor(y);
      // Calculate this pixel's index in the array (accounting for the 4 color channels).
      let i = (y * surface.virtualRect.w + x) * 4;

      // Only allow this pixel to be colored MAX_VALUE - 1 times.
      let v = this.raw[y * surface.virtualRect.w + x];
      if (v < MAX_VALUE - 1) {
        v++;
        this.raw[y * surface.virtualRect.w + x] = v;
        this.imageData.data[i++] = this.clientshape[shape].palette[v * 3 + 0];
        this.imageData.data[i++] = this.clientshape[shape].palette[v * 3 + 1];
        this.imageData.data[i++] = this.clientshape[shape].palette[v * 3 + 2];
      }
    }

    // Helper method to convert an angle in degrees in object space into radians in screen space.
    toRadians(angle: number, shape: number): number {
      return (this.shapes[shape].alpha + angle) * (Math.PI / 180);
    }

    // Helper method to convert an index into the vertices of a shape into the position of that vertex in screen space.
    position(count: number, shape: number): [number, number] {
      const x = Math.cos(
            this.toRadians(360.0 * count / this.shapes[shape].points, shape),
          ) * this.shapes[shape].size + (this.shapes[shape].posx);
      const y = Math.sin(
            this.toRadians(360.0 * count / this.shapes[shape].points, shape),
          ) * this.shapes[shape].size + (this.shapes[shape].posy);
      return [x, y];
    }

    draw() {
      if (!this.shapes.length) return;
      if (this.time != this.oldtime) {
        this.initialize();
        this.oldtime = this.time;
      }

      const surface = this.surface!;

      for (let shape = 0; shape < this.shapes.length; ++shape) {
        if (!(shape in this.clientshape)) {
          // If we have some shape data from the server that we haven't initialized yet, initialize it.
          this.clientshape[shape] = {} as ClientShape;

          // Pick a random point on the surface of the wall to begin.
          this.clientshape[shape].oldx = Math.floor(
            Math.random() * surface.virtualRect.w,
          );
          this.clientshape[shape].oldy = Math.floor(
            Math.random() * surface.virtualRect.h,
          );

          // Cache the positions of the shape vertex.
          this.clientshape[shape].positions = new Array(
            this.shapes[shape].points,
          );
          for (let p = 0; p < this.shapes[shape].points; ++p) {
            this.clientshape[shape].positions[p] = this.position(p, shape);
          }

          // Calculate a palette for this shape.
          this.clientshape[shape].palette = new Array(MAX_VALUE * 3).fill(0);
          const myColor = GOOGLE_COLORS[this.shapes[shape].myColorIndex]!;
          for (let p = 0; p < MAX_VALUE; ++p) {
            this.clientshape[shape].palette[p * 3 + 0] = Math.floor(
              myColor.r / (MAX_VALUE - 1) * p,
            );
            this.clientshape[shape].palette[p * 3 + 1] = Math.floor(
              myColor.g / (MAX_VALUE - 1) * p,
            );
            this.clientshape[shape].palette[p * 3 + 2] = Math.floor(
              myColor.b / (MAX_VALUE - 1) * p,
            );
          }
        }
        // Time to draw! Pick a number of points we should add during this tick.
        let steps = (this.shapes[shape].size * this.shapes[shape].size) / 4.0;
        if (this.shapes[shape].points == 3) {
          steps = steps / 10;
        }
        for (let intervals = 0; intervals < steps; intervals++) {
          // Actually do the chaos simulation:
          // Pick a point, move halfway there, mark it.
          const count = Math.floor(Math.random() * this.shapes[shape].points);
          const p = this.clientshape[shape].positions[count];

          const x = (this.clientshape[shape].oldx + p[0]) / 2.0;
          const y = (this.clientshape[shape].oldy + p[1]) / 2.0;

          this.clientshape[shape].oldx = x;
          this.clientshape[shape].oldy = y;

          this.setPixel(x, y, shape);
        }
      }
      this.canvas.putImageData(this.imageData, 0, 0);
    }
  }
  return { client: ChaosClient };
}
