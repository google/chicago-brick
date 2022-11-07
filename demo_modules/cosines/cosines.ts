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
import { P5Canvas, P5Surface } from "../../client/surface/p5_surface.ts";
import { Surface } from "../../client/surface/surface.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";

export function load(wallGeometry: Polygon) {
  // p5 must be a P5.js instance.
  class CosinesSketch {
    readonly width = 67 * 4;
    readonly height = 45 * 2;
    constructor(readonly p5: P5Canvas, readonly surface: Surface) {
    }

    setup() {
      const p5 = this.p5;
      p5.rectMode(p5.CENTER);
      p5.fill(0);
    }

    scaledCos(x: number) {
      return this.p5.cos(x);
    }

    draw(t: number) {
      const p5 = this.p5;

      p5.background(0);

      const xspace = p5.wallWidth / this.width;
      const yspace = p5.wallHeight / this.height;
      const space = Math.min(xspace, yspace);

      for (let y = 0; y < this.height; ++y) {
        const yp = 360 * y / this.height;
        const yloc = yspace * 0.5 + yspace * y +
          yspace * 0.44 * this.scaledCos(p5.radians(t * 0.0391 + (4.65 * yp)));

        if (yloc + space * 1 < this.surface.virtualRect.y) continue;
        if (
          yloc - space * 1 >
            this.surface.virtualRect.y + this.surface.virtualRect.h
        ) continue;

        for (let x = 0; x < this.width; ++x) {
          const xp = 360 * x / this.width;
          const xloc = xspace * 0.5 + xspace * x +
            xspace * 0.44 *
              this.scaledCos(p5.radians(t * 0.0381 + (4.55 * xp)));

          if (xloc + space * 1 < this.surface.virtualRect.x) continue;
          if (
            xloc - space * 1 >
              this.surface.virtualRect.x + this.surface.virtualRect.w
          ) continue;

          const size = 0.5 + 0.5 *
              this.scaledCos(p5.radians(3.5 * xp)) *
              this.scaledCos(p5.radians(2.7 * yp)) *
              this.scaledCos(p5.radians(t * 0.027));

          const xf = Math.abs(((this.width / 2) - x) / this.width);
          const yf = Math.abs(((this.height / 2) - y) / this.height);
          const p = Math.sqrt(xf * xf + yf * yf);

          p5.fill(
            p5.color(
              255 * Math.max(
                this.scaledCos(p5.radians(t * 0.032 + (2.09 * xp))),
                this.scaledCos(p5.radians(-t * 0.03 + (3.11 * xp))),
              ),
              255 * Math.max(
                this.scaledCos(p5.radians(t * 0.042 + (2.17 * yp))),
                this.scaledCos(p5.radians(-t * 0.04 + (3.64 * yp))),
              ),
              255 * Math.max(
                this.scaledCos(p5.radians(t * -0.0132 + 2.0 * 360.0 * p)),
                this.scaledCos(p5.radians(-t * -0.013 + 3.0 * 360.0 * p)),
              ),
            ),
          );

          p5.ellipse(
            xloc,
            yloc,
            space * size,
            space * size,
          );
        }
      }
    }
  }

  class CosinesClient extends Client {
    constructor() {
      super();
    }

    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    willBeShownSoon(container: HTMLElement, deadline: number) {
      this.surface = new P5Surface(
        container,
        wallGeometry,
        CosinesSketch,
        deadline,
      );
    }

    draw(time: number) {
      (this.surface as P5Surface).p5.draw(time);
    }
  }
  return { client: CosinesClient };
}
