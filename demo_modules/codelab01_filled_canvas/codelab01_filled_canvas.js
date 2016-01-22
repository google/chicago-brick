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

var Codelab01FilledCanvasServer = function(config) {
  debug('Codelab01FilledCanvas Server!', config);
  this.nextColorTime = 0;
};
Codelab01FilledCanvasServer.prototype = Object.create(ServerModuleInterface.prototype);
Codelab01FilledCanvasServer.prototype.tick = function(time, delta) {
};

var Codelab01FilledCanvasClient = function(config) {
  debug('Codelab01FilledCanvas Client!', config);
  this.image = null;
  this.surface = null;
};
Codelab01FilledCanvasClient.prototype = Object.create(ClientModuleInterface.prototype);
Codelab01FilledCanvasClient.prototype.finishFadeOut = function() {
  if (this.surface) {
    this.surface.destroy();
  } 
};
Codelab01FilledCanvasClient.prototype.willBeShownSoon = function(container, deadline) {
  this.startTime = deadline;

  this.surface = new CanvasSurface(container, wallGeometry);
  this.canvas = this.surface.context;

  return Promise.resolve();
};
Codelab01FilledCanvasClient.prototype.draw = function(time, delta) {
  this.canvas.fillStyle = 'blue';
  this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);

  this.canvas.fillStyle = 'red';
  this.canvas.textAlign = 'center';
  var fontHeight = Math.floor(this.surface.virtualRect.h / 10);
  this.canvas.font = fontHeight + 'px Helvetica';
  this.canvas.textBaseline = 'middle';
  this.canvas.fillText('Time: ' + time.toFixed(1), this.surface.virtualRect.w / 2, this.surface.virtualRect.h / 2);
};

register(Codelab01FilledCanvasServer, Codelab01FilledCanvasClient);
