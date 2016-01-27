/* Copyright 2015 Google Inc. All Rights Reserved.

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

class P5TemplateServer extends ServerModuleInterface {
  constructor(config, startTime) {
    super();
    debug('P5Template Server!', config);
    this.startTime = startTime;
  }
}

// p5 must be a P5.js instance.
function P5TemplateSketch(p5, surface) {
  this.p5 = p5;
  this.surface = surface;
}

P5TemplateSketch.prototype.preload = function() {
};

P5TemplateSketch.prototype.setup = function() {
  var p5 = this.p5;

  p5.background(128, 128, 128);
};

P5TemplateSketch.prototype.draw = function(t, balls) {
};

class P5TemplateClient extends ClientModuleInterface {
  constructor(config) {
    super();
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
  }

  draw(time, delta) {
    this.surface.p5.draw(time);
  }
}

register(P5TemplateServer, P5TemplateClient);
