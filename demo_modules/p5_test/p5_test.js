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

var P5TestServer = function(config, startTime) {
  debug('P5Test Server!', config);
  this.startTime = startTime;
};
P5TestServer.prototype = Object.create(ServerModuleInterface.prototype);

var P5TestClient = function(config) {
  debug('P5Test Client!', config);
  this.image = null;
  this.surface = null;
};

P5TestClient.prototype = Object.create(ClientModuleInterface.prototype);

P5TestClient.prototype.finishFadeOut = function() {
  if (this.surface) {
    this.surface.destroy();
  }
};

// p5 must be a P5.js instance.
function P5TestSketch(p5) {
  this.p5 = p5;
  this.rectangleColor = null;
  this.verticalCircleColor = null;
  this.horizontalCircleColor = null;
  this.scalar = 300;
  this.squareSize = 1000;
}

P5TestSketch.prototype.setup = function() {
  var p5 = this.p5;
  p5.rectMode(p5.CENTER);
  p5.fill(0);

  this.rectangleColor = p5.color(p5.random(255), p5.random(255), p5.random(255));
  this.verticalCircleColor = p5.color(p5.random(255), p5.random(255), p5.random(255));
  this.horizontalCircleColor = p5.color(p5.random(255), p5.random(255), p5.random(255));
};

P5TestSketch.prototype.draw = function(t, board) {
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
};

P5TestClient.prototype.willBeShownSoon = function(container, deadline) {
  this.startTime = deadline;

  this.surface = new P5Surface(container, wallGeometry, P5TestSketch, deadline);

  return Promise.resolve();
};

P5TestClient.prototype.draw = function(time, delta) {
  this.surface.p5.draw(time);
};

register(P5TestServer, P5TestClient);
