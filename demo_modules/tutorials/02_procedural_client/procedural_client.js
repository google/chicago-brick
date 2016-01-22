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

var ProceduralServer = function() {};
ProceduralServer.prototype = Object.create(ServerModuleInterface.prototype);

var ProceduralClient = function() {};
ProceduralClient.prototype = Object.create(ClientModuleInterface.prototype);
ProceduralClient.prototype.willBeShownSoon = function(container) {
  this.surface = new CanvasSurface(container, wallGeometry);
  this.canvas = this.surface.context;
};
ProceduralClient.prototype.draw = function(time, delta) {
  var centerX = this.surface.virtualRect.w/2;
  var centerY = this.surface.virtualRect.h/2;

  var xSpeed = (5+this.surface.virtualOffset.x*17) % this.surface.virtualOffset.w;
  var ySpeed = (2+this.surface.virtualOffset.y*15) % this.surface.virtualOffset.h;
  var x = 400 * Math.cos(time / 1000 * (1 + xSpeed)) + centerX;
  var y = 400 * Math.sin(time / 1000 * (1 + ySpeed)) + centerY;
  // Clear:
  this.canvas.clearRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
  // Draw a red box.
  this.canvas.fillStyle = 'red';
  this.canvas.fillRect(x - 50, y - 50, 100, 100);
};

register(ProceduralServer, ProceduralClient);
