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

import { Client } from "../../client/modules/module_interface.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";

export function load(wallGeometry: Polygon) {
  class GenlockTestClient extends Client {
    canvas!: CanvasRenderingContext2D;
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    willBeShownSoon(container: HTMLElement) {
      const surface = new CanvasSurface(container, wallGeometry);
      this.surface = surface;
      this.canvas = surface.context;

      // Despite the background and text colors changing, the rest of the text
      // styling doesn't need to change on each frame.
      this.canvas.textAlign = "center";
      const fontHeight = Math.floor(this.surface.virtualRect.h / 10);
      this.canvas.font = fontHeight + "px Helvetica";
      this.canvas.textBaseline = "middle";
    }

    draw(time: number, delta: number) {
      const seconds = time / 1000;
      const nowIntSeconds = Math.floor(seconds);
      const lastIntSeconds = Math.floor(seconds - delta / 1000);
      if (nowIntSeconds != lastIntSeconds) {
        this.canvas.fillStyle = "white";
      } else {
        this.canvas.fillStyle = "black";
      }
      this.canvas.fillRect(
        0,
        0,
        this.surface!.virtualRect.w,
        this.surface!.virtualRect.h,
      );
    }
  }
  return { client: GenlockTestClient };
}
