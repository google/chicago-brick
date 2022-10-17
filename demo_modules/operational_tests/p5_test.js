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

import { Client } from '/lib/module_interface.ts';
import {P5Surface} from '/client/surface/p5_surface.ts';

export function load(wallGeometry, debug) {
  // p5 must be a P5.js instance.
  class P5TestSketch {
    constructor(p5, surface) {
      this.p5 = p5;
      this.surface = surface;
      this.rectangleColor = null;
      this.verticalCircleColor = null;
      this.horizontalCircleColor = null;
      this.scalar = 300;
      this.squareSize = 1000;
    }

    setup() {
      var p5 = this.p5;
      p5.rectMode(p5.CENTER);
      p5.fill(0);

      this.rectangleColor = p5.color(p5.random(255), p5.random(255), p5.random(255));
      this.verticalCircleColor = p5.color(p5.random(255), p5.random(255), p5.random(255));
      this.horizontalCircleColor = p5.color(p5.random(255), p5.random(255), p5.random(255));
    }

    draw(t) {
      var p5 = this.p5;

      p5.background(0);

      var angRect = p5.radians(t) / 25;
      p5.push();
      p5.fill(this.rectangleColor);
      p5.translate(p5.wallWidth / 2, p5.wallHeight / 2);
      p5.rotate(angRect);
      p5.rect(0, 0, this.squareSize, this.squareSize);
      p5.pop();

      var ang1 = p5.radians(t) / 10;
      var ang2 = p5.radians(t) / 5;

      var x1 = p5.wallWidth/2 + this.scalar * p5.cos(ang1);
      var x2 = p5.wallWidth/2 + this.scalar * p5.cos(ang2);

      var y1 = p5.wallHeight/2 + this.scalar * p5.sin(ang1);
      var y2 = p5.wallHeight/2 + this.scalar * p5.sin(ang2);

      p5.fill(this.verticalCircleColor);
      p5.ellipse(x1, p5.wallHeight*0.5 - this.squareSize * 0.87, this.scalar, this.scalar);
      p5.ellipse(x2, p5.wallHeight*0.5 + this.squareSize * 0.87, this.scalar, this.scalar);

      p5.fill(this.horizontalCircleColor);
      p5.ellipse(p5.wallWidth*0.5 - this.squareSize * 0.87, y1, this.scalar, this.scalar);
      p5.ellipse(p5.wallWidth*0.5 + this.squareSize * 0.87, y2, this.scalar, this.scalar);
    }
  }

  class P5TestClient extends Client {
    constructor(config) {
      super();
      debug('P5Test Client!', config);
      this.image = null;
      this.surface = null;
    }

    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    async willBeShownSoon(container, deadline) {
      this.surface = new P5Surface(container, wallGeometry, P5TestSketch, deadline);
    }

    draw(time) {
      this.surface.p5.draw(time);
    }
  }

  return {client: P5TestClient};
}
