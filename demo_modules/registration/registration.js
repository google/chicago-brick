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

var RegistrationServer = function() {};
RegistrationServer.prototype = Object.create(ServerModuleInterface.prototype);

var RegistrationClient = function(config) {
  this.speed_ = config.speed || 1;
};
RegistrationClient.prototype = Object.create(ClientModuleInterface.prototype);
RegistrationClient.prototype.finishFadeOut = function() {
  if (this.surface) {
    this.surface.destroy();
  } 
};
RegistrationClient.prototype.willBeShownSoon = function(container, deadline) {
  this.surface = new CanvasSurface(container, wallGeometry);
  this.canvas = this.surface.context;
};
RegistrationClient.prototype.draw = function(time, delta) {
  this.canvas.fillStyle = 'black';
  this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
  
  var x = time * this.speed_ % this.surface.virtualRect.w;
  var y = time * this.speed_ % this.surface.virtualRect.h;
  
  this.canvas.strokeStyle = 'white';
  this.canvas.beginPath();
  this.canvas.moveTo(0, y);
  this.canvas.lineTo(this.surface.virtualRect.w, y);
  this.canvas.moveTo(x, 0);
  this.canvas.lineTo(x, this.surface.virtualRect.h);
  
  this.canvas.stroke();
};

register(RegistrationServer, RegistrationClient);
