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

var P5TemplateServer = function(config, startTime) {
  debug('P5Template Server!', config);
  this.startTime = startTime;
};

P5TemplateServer.prototype = Object.create(ServerModuleInterface.prototype);

P5TemplateServer.prototype.willBeShownSoon = function() {
  return Promise.resolve();
};

P5TemplateServer.prototype.dispose = function() {
};

P5TemplateServer.prototype.tick = function(time, delta) {
};

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

var P5TemplateClient = function(config) {
  debug('P5Template Client!', config);
};

P5TemplateClient.prototype = Object.create(ClientModuleInterface.prototype);

P5TemplateClient.prototype.beginFadeIn = function(time) {
};

P5TemplateClient.prototype.finishFadeOut = function() {
  if (this.surface) {
    this.surface.destroy();
  }
};

P5TemplateClient.prototype.willBeShownSoon = function(container, deadline) {
  this.startTime = deadline;

  this.surface = new P5Surface(container, wallGeometry, P5TemplateSketch, deadline);

  return Promise.resolve();
};

P5TemplateClient.prototype.draw = function(time, delta) {
  this.surface.p5.draw(time);
};

register(P5TemplateServer, P5TemplateClient);
