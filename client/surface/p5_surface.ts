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
import P5 from "https://esm.sh/p5@0.8";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { Point } from "../../lib/math/vector2d.ts";

interface Sketch {
  preload(p5: P5): void;
  setup(p5: P5): void;
  draw(...args: unknown[]): void;
}

type SketchClass = {
  new (p5: P5, surface: P5Surface, sketchConstructorArgs: unknown): Sketch;
};

// Sets up the sizes and scaling factors. The P5 library will take care of creating a canvas.
// sketch is the actual p5.js code that will be executed.  sketch.setup() will be called at
// the end of the wall-provided setup() method and draw() will be invoked as well.
// sketchArgs will be passed along to the constructor call on providedSketchClass.
export class P5Surface extends Surface {
  readonly realPixelScalingFactors: Point;
  readonly startTime: number;
  sketch: Sketch | null;
  p5: P5;

  constructor(
    container: Element,
    wallGeometry: Polygon,
    providedSketchClass: SketchClass,
    startTime: number,
    sketchConstructorArgs: unknown,
  ) {
    super(container, wallGeometry);

    this.realPixelScalingFactors = {
      x: this.container.offsetWidth / this.virtualRect.w,
      y: this.container.offsetHeight / this.virtualRect.h,
    };

    this.startTime = startTime;
    var randomSeed = this.startTime || 0;

    var processing_canvas_width = this.container.offsetWidth;
    var processing_canvas_height = this.container.offsetHeight;

    var xScale = this.realPixelScalingFactors.x;
    var yScale = this.realPixelScalingFactors.y;

    var wallWidth = this.wallRect.w;
    var wallHeight = this.wallRect.h;

    var xOffset = this.virtualRect.x;
    var yOffset = this.virtualRect.y;

    this.sketch = null;

    var surface = this;

    // p5 must be a P5.js instance.  new P5(...) below takes care of this.
    var scaffolding = function (p5) {
      surface.sketch = new providedSketchClass(
        p5,
        surface,
        sketchConstructorArgs,
      );

      p5.wallWidth = wallWidth;
      p5.wallHeight = wallHeight;

      p5.preload = function () {
        if (typeof (surface.sketch!.preload) == "function") {
          surface.sketch!.preload(p5);
        }
      };

      p5.setup = function () {
        // Videowall required setup.
        p5.createCanvas(processing_canvas_width, processing_canvas_height);
        p5.resetMatrix();
        p5.noLoop();
        p5.randomSeed(randomSeed);

        surface.sketch!.setup(p5);
      };

      p5.draw = (...args: unknown[]) => {
        p5.push();
        p5.scale(xScale, yScale);
        p5.translate(-xOffset, -yOffset);
        surface.sketch!.draw(...args);
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
    const canvas = this.container.querySelector("canvas");
    return canvas.getContext("2d").getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }
}
