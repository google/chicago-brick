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

import { Polygon } from "../../lib/math/polygon2d.ts";
import { Surface } from "./surface.ts";

export class CanvasSurface extends Surface {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  constructor(container: HTMLElement, wallGeometry: Polygon) {
    super(container, wallGeometry);

    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.left = "0";
    this.canvas.style.right = "0";
    this.canvas.style.top = "0";
    this.canvas.style.bottom = "0";
    this.canvas.style.padding = "0";
    this.canvas.style.margin = "0";

    this.canvas.setAttribute("width", String(this.virtualRect.w));
    this.canvas.setAttribute("height", String(this.virtualRect.h));

    container.appendChild(this.canvas);

    this.context = this.canvas.getContext("2d")!;
  }
  destroy() {
    this.canvas.remove();
  }
  pushOffset() {
    this.context.save();
    this.applyOffset();
  }
  applyOffset() {
    this.context.translate(-this.virtualRect.x, -this.virtualRect.y);
  }
  popOffset() {
    this.context.restore();
  }
  setOpacity(alpha: number) {
    this.canvas.style.opacity = String(alpha);
  }
  takeSnapshot() {
    return this.context.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
  }
}
