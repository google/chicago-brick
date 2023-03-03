/* Copyright 2023 Google Inc. All Rights Reserved.

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

import { Client } from '../../client/modules/module_interface.ts';
import { P5Canvas, P5Surface } from '../../client/surface/p5_surface.ts';
import { Surface } from '../../client/surface/surface.ts';
import { Polygon } from '../../lib/math/polygon2d.ts';

export function load(wallGeometry: Polygon) {
  const frames = 200;
  const delayFrames = 400;
  const amtGridx = 26;
  const amtGridy = 10;
  const amtShapes = 250;
  const points = [];
  const movers = [];
  let nOff = 0;
  const ease = {
    easeInOutQuart: (t) =>
      t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
    easeOutQuint: (t) => 1 + --t * t * t * t * t,
  };
  const colors = [
    '#BF0413',
    '#023E73',
    '#02733E',
    '#F29F05',
    '#F24405',
    '#000',
  ];
  function getRandomPoint(p5) {
    const width = p5.wallWidth;
    const height = p5.wallWidth;
    const nscl = 4;
    let pt = p5.random(points);
    let pctx = p5.map(pt.x, 0, width, 0, 1);
    let pcty = p5.map(pt.y, 0, height, 0, 1);
    let n = p5.noise(pctx * nscl, pcty * nscl, nOff);
    do {
      pt = p5.random(points);
      pctx = p5.map(pt.x, 0, width, 0, 1);
      pcty = p5.map(pt.y, 0, height, 0, 1);
      n = p5.noise(pctx * nscl, pcty * nscl, nOff);
    } while (n > p5.random(0.5));
    return pt;
  }

  class Mover {
    constructor(baseSize, p5) {
      this.p5 = p5;
      const { TAU } = this.p5;
      this.pos = getRandomPoint(this.p5);
      this.startPos = this.pos.copy();
      this.nextPos = getRandomPoint(this.p5);

      this.size = 1;
      this.sizes = [];

      const amtSizes = 4;
      new Array(amtSizes).fill('').forEach((_, i) => {
        const sz = (i + 1) * baseSize;
        for (let v = 0; v < amtSizes - i; v++) {
          this.sizes.push(sz);
        }
      });
      this.nextSize = p5.random(this.sizes);
      this.startSize = p5.random(this.sizes);
      this.rotations = [0, TAU * 0.25, TAU * 0.5, TAU * 0.75];
      this.rotation = p5.random(this.rotations);
      this.nextRotation = p5.random(this.rotations);
      this.startRotation = p5.random(this.rotations);
      this.arcSegments = [TAU * 0.25, TAU * 0.33, TAU * 0.5];
      this.arcSegment = p5.random(this.arcSegments);
      this.nextArcSegment = p5.random(this.arcSegments);
      this.startArcSegment = p5.random(this.arcSegments);
      this.color = p5.random(colors);
      this.currFrame = 0;
    }
    update() {
      const { p5 } = this;

      if (this.currFrame < frames) {
        let framePct = (this.currFrame % frames) / (frames - 1);
        framePct = ease.easeInOutQuart(framePct);
        const posx = p5.lerp(this.startPos.x, this.nextPos.x, framePct);
        const posy = p5.lerp(this.startPos.y, this.nextPos.y, framePct);
        this.pos = p5.createVector(posx, posy);

        this.size = p5.lerp(this.startSize, this.nextSize, framePct);
        this.rotation = p5.lerp(
          this.startRotation,
          this.nextRotation,
          framePct
        );
        this.arcSegment = p5.lerp(
          this.startArcSegment,
          this.nextArcSegment,
          framePct
        );
      } else if (this.currFrame < frames + delayFrames) {
        if (this.currFrame === frames + 1) {
          nOff++;
        }
      } else {
        this.startPos = this.nextPos;
        this.nextPos = getRandomPoint(p5);
        this.startSize = this.nextSize;
        this.nextSize = p5.random(this.sizes);
        this.startRotation = this.nextRotation;
        this.nextRotation = p5.random(this.rotations);
        this.startArcSegment = this.nextArcSegment;
        this.nextArcSegment = p5.random(this.arcSegments);
        this.currFrame = 0;
      }

      this.currFrame++;
      this.draw();
    }
    draw() {
      const { p5 } = this;
      p5.fill(this.color);
      p5.push();
      p5.translate(this.pos.x, this.pos.y);
      p5.rotate(this.rotation);
      p5.arc(0, 0, this.size, this.size, 0, this.arcSegment);
      p5.pop();
    }
  }

  class ShiftingShapesSketch {
    constructor(readonly p5: P5Canvas, readonly surface: Surface) {
      this.p5 = p5;
    }

    setup() {
      const { p5 } = this;
      p5.randomSeed(0);
      p5.noiseSeed(0);

      for (let x = 0; x < amtGridx; x++) {
        const pctx = x / (amtGridx - 1);
        const posx = p5.map(pctx, 0, 1, 0, p5.wallWidth);
        for (let y = 0; y < amtGridy; y++) {
          const pcty = y / (amtGridy - 1);
          const posy = p5.map(pcty, 0, 1, 0, p5.wallHeight);
          if (
            x !== 0 &&
            x !== amtGridx - 1 &&
            y !== 0 &&
            y !== amtGridy - 1
          ) {
            points.push(p5.createVector(posx, posy));
          }
        }
      }

      const baseSize = points[1].copy().sub(points[0]).mag() * 0.5;
      for (let i = 0; i < amtShapes; i++) {
        movers.push(new Mover(baseSize, p5));
      }
    }

    draw() {
      const { p5 } = this;
      p5.background(250);
      p5.stroke(0);
      for (const { x, y } of points) p5.point(x, y);
      p5.noStroke();
      p5.fill(0);
      for (const m of movers) m.update();
    }
  }

  class ShiftingShapesClient extends Client {
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
        ShiftingShapesSketch,
        deadline
      );
    }

    draw(time: number) {
      (this.surface as P5Surface).p5.draw(time);
    }
  }
  return { client: ShiftingShapesClient };
}
