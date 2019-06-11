/* Copyright 2018 Google Inc. All Rights Reserved.

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

export function life(wallGeometry, debug, P5Surface) {
  // p5 must be a P5.js instance.
  // TODO(jgessner): Make a P5Sketch base class.  I'm keeping the empty methods in
  //   here for now to remind me of the interface it should have.
  class P5TemplateSketch {
    constructor(p5, surface) {
      this.p5 = p5;
      this.surface = surface;
    }

    setup() {
      var p5 = this.p5;

      p5.background(128, 128, 128);
    }

    preload() {
    }

    draw(t) {
    }
  }

  class P5TemplateClient {
    constructor(config) {
      debug('P5Template Client!', config);
    }

    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    willBeShownSoon(container, deadline) {
      this.startTime = deadline;

      this.surface = new P5Surface(container, wallGeometry, P5TemplateSketch, deadline);
      return Promise.resolve();
    }

    draw(time) {
      this.surface.p5.draw(time);
    }
  }

  return {client: P5TemplateClient};
}
