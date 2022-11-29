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

import { Surface } from "./surface.ts";
import P5, { p5InstanceExtensions } from "https://cdn.skypack.dev/p5?dts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { Point } from "../../lib/math/vector2d.ts";

interface Sketch {
  preload?(p5: P5): void;
  setup(p5: P5): void;
  draw(...args: unknown[]): void;
}

type SketchClass = {
  new (
    p5: P5Canvas,
    surface: P5Surface,
    sketchConstructorArgs: unknown,
  ): Sketch;
};

type ModdedP5 = Exclude<P5, "draw"> & { draw(...args: unknown[]): void };

export interface P5Canvas extends p5InstanceExtensions {
  wallWidth: number;
  wallHeight: number;
}

// Sets up the sizes and scaling factors. The P5 library will take care of creating a canvas.
// sketch is the actual p5.js code that will be executed.  sketch.setup() will be called at
// the end of the wall-provided setup() method and draw() will be invoked as well.
// sketchArgs will be passed along to the constructor call on providedSketchClass.
export class P5Surface extends Surface {
  readonly realPixelScalingFactors: Point;
  readonly startTime: number;
  sketch: Sketch | null;
  p5: ModdedP5;

  constructor(
    container: HTMLElement,
    wallGeometry: Polygon,
    providedSketchClass: SketchClass,
    startTime: number,
    sketchConstructorArgs?: unknown,
  ) {
    super(container, wallGeometry);

    this.realPixelScalingFactors = {
      x: container.offsetWidth / this.virtualRect.w,
      y: container.offsetHeight / this.virtualRect.h,
    };

    this.startTime = startTime;
    const randomSeed = this.startTime || 0;

    const processing_canvas_width = container.offsetWidth;
    const processing_canvas_height = container.offsetHeight;

    const xScale = this.realPixelScalingFactors.x;
    const yScale = this.realPixelScalingFactors.y;

    const wallWidth = this.wallRect.w;
    const wallHeight = this.wallRect.h;

    const xOffset = this.virtualRect.x;
    const yOffset = this.virtualRect.y;

    this.sketch = null;

    // p5 must be a P5.js instance.  new P5(...) below takes care of this.
    const scaffolding = (p5: ModdedP5) => {
      this.sketch = new providedSketchClass(
        p5 as unknown as P5Canvas,
        this,
        sketchConstructorArgs,
      );

      (p5 as unknown as P5Canvas).wallWidth = wallWidth;
      (p5 as unknown as P5Canvas).wallHeight = wallHeight;

      p5.preload = () => {
        if (typeof (this.sketch!.preload) == "function") {
          this.sketch!.preload(p5);
        }
      };

      p5.setup = () => {
        // Videowall required setup.
        p5.createCanvas(processing_canvas_width, processing_canvas_height);
        p5.resetMatrix();
        p5.noLoop();
        p5.randomSeed(randomSeed);

        this.sketch!.setup(p5);
      };

      p5.draw = (...args: unknown[]) => {
        p5.push();
        p5.scale(xScale, yScale);
        p5.translate(-xOffset, -yOffset);
        this.sketch!.draw(...args);
        p5.pop();
      };

      p5.frameRate(60);
    };

    this.p5 = new P5(scaffolding, container);
  }
  destroy() {
    if (this.p5) {
      this.p5.remove();
    }
  }
  takeSnapshot() {
    const canvas = this.container.querySelector("canvas")!;
    return canvas.getContext("2d")!.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }
}

export { P5 };
