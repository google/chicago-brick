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

const ModuleInterface = require('lib/module_interface');

class ProceduralServer extends ModuleInterface.Server {}

// This module draws a red square on each screen on the wall. The square's x
// position is based on the x offset of the screen and the cosine function,
// while the y position is based on the y offset of the screen and sine
// function. The sine and cosine functions are applied to the time given to the
// draw method.

// Play with various values of xSpeed, ySpeed and maxDistance to see different
// patterns.
class ProceduralClient extends ModuleInterface.Client {
  constructor(config, services) {
    super();
    this.wallGeometry = services.locate('wallGeometry');
  }
  willBeShownSoon(container) {
    const CanvasSurface = require('client/surface/canvas_surface');
    this.surface = new CanvasSurface(container, this.wallGeometry);
    this.canvas = this.surface.context;

    // Don't put things in draw that don't change from frame to frame.

    // The center point here is of a particular screen, not of the wall.
    this.centerX = this.surface.virtualRect.w/2;
    this.centerY = this.surface.virtualRect.h/2;

    this.maxXDistance = 400;
    this.maxYDistance = 200;
    this.xSpeed = 1 + (5+this.surface.virtualOffset.x*17) % this.surface.virtualOffset.w;
    this.ySpeed = 1 + (2+this.surface.virtualOffset.y*15) % this.surface.virtualOffset.h;

    this.canvas.fillStyle = 'red';
  }

  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
  }

  draw(time, delta) {
    this.canvas.clearRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);

    // Draw a red box.
    var x = this.maxXDistance * Math.cos(time / 1000 * this.xSpeed) + this.centerX;
    var y = this.maxYDistance * Math.sin(time / 1000 * this.ySpeed) + this.centerY;

    this.canvas.fillRect(x - 50, y - 50, 100, 100);
  }
}

register(ProceduralServer, ProceduralClient);
