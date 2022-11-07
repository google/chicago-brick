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

interface Config {
  speed: number;
}

export function load(wallGeometry: Polygon) {
  class RegistrationClient extends Client {
    speed_: number;
    canvas!: CanvasRenderingContext2D;
    constructor(config: Config) {
      super();
      this.speed_ = config.speed || 1;
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
    }

    draw(time: number) {
      this.canvas.fillStyle = "black";
      this.canvas.fillRect(
        0,
        0,
        this.surface!.virtualRect.w,
        this.surface!.virtualRect.h,
      );

      const x = time * this.speed_ % this.surface!.virtualRect.w;
      const y = time * this.speed_ % this.surface!.virtualRect.h;

      this.canvas.strokeStyle = "white";
      this.canvas.beginPath();
      this.canvas.moveTo(0, y);
      this.canvas.lineTo(this.surface!.virtualRect.w, y);
      this.canvas.moveTo(x, 0);
      this.canvas.lineTo(x, this.surface!.virtualRect.h);

      this.canvas.stroke();
    }
  }

  return { client: RegistrationClient };
}
