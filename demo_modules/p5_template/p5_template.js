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

const register = require('register');
const ModuleInterface = require('lib/module_interface');
const wallGeometry = require('wallGeometry');
const debug = require('debug');

class P5TemplateServer extends ModuleInterface.Server {
  constructor(config, startTime) {
    super();
    debug('P5Template Server!', config);
    this.startTime = startTime;
  }
}

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

class P5TemplateClient extends ModuleInterface.Client {
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

    const P5Surface = require('client/surface/p5_surface');
    this.surface = new P5Surface(container, wallGeometry, P5TemplateSketch, deadline);
    return Promise.resolve();
  }

  draw(time, delta) {
    this.surface.p5.draw(time);
  }
}

register(P5TemplateServer, P5TemplateClient);
