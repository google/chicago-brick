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
const geometry = require('lib/geometry');
const wallGeometry = require('wallGeometry');
const state = require('state');

class StarsServer extends ModuleInterface.Server {
  constructor() {
    super();
    this.stars = [];
  }

  willBeShownSoon() {
    // Randomly create the stars.
    for (var i = 0; i < 1000; ++i) {
      this.stars.push({x: Math.random() * wallGeometry.extents.w,
                       y: Math.random() * wallGeometry.extents.h});
    }
    
    state.create('stars', [{
      x: 'NumberLerpInterpolator',
      y: 'NumberLerpInterpolator',
    }]);
  }

  tick(time, delta) {
    var centerX = wallGeometry.extents.x + wallGeometry.extents.w/2;
    var centerY = wallGeometry.extents.y + wallGeometry.extents.h/2;
    this.stars.forEach(function(star, index) {
      if (star.x === Infinity) {
        var width = 300;
        var height = width * wallGeometry.extents.h / wallGeometry.extents.w;
        star.x = (Math.random()-0.5) * width;
        star.y = (Math.random()-0.5) * height;
        star.x += centerX;
        star.y += centerY;
      }
      
      var dx = 2 * (star.x - centerX);
      var dy = 2 * (star.y - centerY);
      
      star.x += dx * delta / 1000;
      star.y += dy * delta / 1000;
      
      if (!geometry.isInsideRect(wallGeometry.extents, star.x, star.y)) {
        // Ensure the lerp lerps off screen.
        star.x = Infinity;
        star.y = Infinity;
      }
    });
    
    state.get('stars').set(this.stars, time);
  }
}

class StarsClient extends ModuleInterface.Client {
  willBeShownSoon(container, deadline) {
    const CanvasSurface = require('client/surface/canvas_surface');
    this.surface = new CanvasSurface(container, wallGeometry);
    this.canvas = this.surface.context;
  }

  draw(time, delta) {
    // Clear the screen.
    this.canvas.fillStyle = 'black';
    this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    
    var starsState = state.get('stars');
    if (!starsState) {
      return;
    }
    var stars = starsState.get(time - 100);
    if (!stars) {
      // Wait a little bit.
      return;
    }

    var centerX = wallGeometry.extents.x + wallGeometry.extents.w/2;
    var centerY = wallGeometry.extents.y + wallGeometry.extents.h/2;
    
    // Push a transform.
    this.surface.pushOffset();
    
    this.canvas.strokeStyle = 'white';
    stars.forEach(function(star, index) {
      if (star.x === null) {
        return;
      }
      var deltaX = star.x - centerX;
      var deltaY = star.y - centerY;
      var destX = star.x + deltaX/10;
      var destY = star.y + deltaY/10;
      var gradient = this.canvas.createLinearGradient(star.x, star.y, destX, destY);
      // Tint the tip of the trail just a little bit.
      var tipColor = ['#FEE', '#EFE', '#EEF'][index % 3];
      gradient.addColorStop(0, '#AAA');
      gradient.addColorStop(1, tipColor);
      this.canvas.strokeStyle = gradient;
      this.canvas.beginPath();
      this.canvas.moveTo(star.x, star.y);
      this.canvas.lineTo(destX, destY);
      this.canvas.stroke();
    }, this)
    
    this.surface.popOffset();
  }

  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    } 
  }
}

register(StarsServer, StarsClient);
