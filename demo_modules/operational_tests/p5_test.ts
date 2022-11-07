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
import { P5, P5Canvas, P5Surface } from "../../client/surface/p5_surface.ts";
import { Surface } from "../../client/surface/surface.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";

export function load(wallGeometry: Polygon) {
  // p5 must be a P5.js instance.
  class P5TestSketch {
    rectangleColor: P5.Color | null = null;
    verticalCircleColor: P5.Color | null = null;
    horizontalCircleColor: P5.Color | null = null;
    scalar = 300;
    squareSize = 1000;

    constructor(readonly p5: P5Canvas, readonly surface: Surface) {
    }

    setup() {
      const p5 = this.p5;
      p5.rectMode(p5.CENTER);
      p5.fill(0);

      this.rectangleColor = p5.color(
        p5.random(255),
        p5.random(255),
        p5.random(255),
      );
      this.verticalCircleColor = p5.color(
        p5.random(255),
        p5.random(255),
        p5.random(255),
      );
      this.horizontalCircleColor = p5.color(
        p5.random(255),
        p5.random(255),
        p5.random(255),
      );
    }

    draw(t: number) {
      const p5 = this.p5;

      p5.background(0);

      const angRect = p5.radians(t) / 25;
      p5.push();
      p5.fill(this.rectangleColor!);
      p5.translate(p5.wallWidth / 2, p5.wallHeight / 2);
      p5.rotate(angRect);
      p5.rect(0, 0, this.squareSize, this.squareSize);
      p5.pop();

      const ang1 = p5.radians(t) / 10;
      const ang2 = p5.radians(t) / 5;

      const x1 = p5.wallWidth / 2 + this.scalar * p5.cos(ang1);
      const x2 = p5.wallWidth / 2 + this.scalar * p5.cos(ang2);

      const y1 = p5.wallHeight / 2 + this.scalar * p5.sin(ang1);
      const y2 = p5.wallHeight / 2 + this.scalar * p5.sin(ang2);

      p5.fill(this.verticalCircleColor!);
      p5.ellipse(
        x1,
        p5.wallHeight * 0.5 - this.squareSize * 0.87,
        this.scalar,
        this.scalar,
      );
      p5.ellipse(
        x2,
        p5.wallHeight * 0.5 + this.squareSize * 0.87,
        this.scalar,
        this.scalar,
      );

      p5.fill(this.horizontalCircleColor!);
      p5.ellipse(
        p5.wallWidth * 0.5 - this.squareSize * 0.87,
        y1,
        this.scalar,
        this.scalar,
      );
      p5.ellipse(
        p5.wallWidth * 0.5 + this.squareSize * 0.87,
        y2,
        this.scalar,
        this.scalar,
      );
    }
  }

  class P5TestClient extends Client {
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    willBeShownSoon(container: HTMLElement, deadline: number) {
      this.surface = new P5Surface(
        container,
        wallGeometry,
        P5TestSketch,
        deadline,
      );
    }

    draw(time: number) {
      (this.surface as P5Surface).p5.draw(time);
    }
  }

  return { client: P5TestClient };
}
