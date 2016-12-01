/* Copyright 2016 Google Inc. All Rights Reserved.

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
const geometry = require('lib/geometry');
const Rectangle = require('lib/rectangle');

const network = require('network');
const wallGeometry = require('wallGeometry');

var GOOGLE_COLORS = ['#3369e8', '#d50f25', '#eeb211', '#009925', '#FFFFFF'];

class ChaosServer extends ModuleInterface.Server {
}

class ChaosClient extends ModuleInterface.Client {
  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
  }
  
  hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
  }  

  willBeShownSoon(container, deadline) {
    const CanvasSurface = require('client/surface/canvas_surface');
    this.surface = new CanvasSurface(container, wallGeometry);
    this.canvas = this.surface.context;
    this.imageData = this.canvas.getImageData(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    this.raw = new Array(this.surface.virtualRect.w * this.surface.virtualRect.h).fill(0);
    this.initialize();
  }
  
  initialize() {
    this.canvas.fillStyle = 'black';
    this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    this.raw.fill(0);
    this.maxValue = 32;
    this.palette = new Array(this.maxValue * 3).fill(0);
    var myColorIndex = Math.floor((Math.random() * GOOGLE_COLORS.length));
    var myColor = this.hexToRgb(GOOGLE_COLORS[myColorIndex]);
    for (var p = 0; p < this.maxValue; ++p)
    {
        this.palette[p*3+0] = Math.floor(myColor.r / (this.maxValue - 1) * p);
        this.palette[p*3+1] = Math.floor(myColor.g / (this.maxValue - 1) * p);
        this.palette[p*3+2] = Math.floor(myColor.b / (this.maxValue - 1) * p);
    }
    var i = 0;
    for (var y = 0; y < this.surface.virtualRect.h; ++y) {
      for (var x = 0; x < this.surface.virtualRect.w; ++x) {
        this.imageData.data[i++] = 0;
        this.imageData.data[i++] = 0;
        this.imageData.data[i++] = 0;
        this.imageData.data[i++] = 255;
      }
    }

    do {
        this.points = 3 + Math.floor((Math.random() * 10));
    } while (this.points == 4);
    this.alpha = Math.random() * 360.0; // degrees of random rotation to add
    this.oldx = Math.floor((Math.random() * this.surface.virtualRect.w));
    this.oldy = Math.floor((Math.random() * this.surface.virtualRect.h));
    
    this.positions = new Array(this.points);
    for (var p = 0; p < this.points; ++p) {
        this.positions[p] = this.position(p);    
    }
  }

  setPixel(x, y) {
    x = parseInt(x, 10);
    y = parseInt(y, 10);
    if ((x < 0) || (y < 0) || (x >= this.surface.virtualRect.w) || (y >= this.surface.virtualRect.h)) return;
    var i = (y * this.surface.virtualRect.w + x) * 4;

    var v = this.raw[y * this.surface.virtualRect.w + x];
    if (v < this.maxValue - 1) {
        v++;
        this.raw[y * this.surface.virtualRect.w + x] = v;
        this.imageData.data[i++] = this.palette[v*3+0];
        this.imageData.data[i++] = this.palette[v*3+1];
        this.imageData.data[i++] = this.palette[v*3+2];
    }
  }
  
  toRadians (angle) {
    return (this.alpha + angle) * (Math.PI / 180);
  }

  position(count) {
    var size = Math.min(this.surface.virtualRect.w, this.surface.virtualRect.h) / 2;
    var x = Math.cos(this.toRadians(360.0 * count / this.points)) * size + (this.surface.virtualRect.w / 2);
    var y = Math.sin(this.toRadians(360.0 * count / this.points)) * size + (this.surface.virtualRect.h / 2);
    return [x, y];
  }

  draw(time, delta) {
    if (Math.random() < 0.001) {
        this.initialize();
    }
    var steps = 10000;
    if (this.points == 3) {
        steps = steps / 10;
    }
    for (var intervals = 0; intervals < steps; intervals++) {
        var count = Math.floor((Math.random() * this.points));
        var p = this.positions[count];
        
        var x = (this.oldx + p[0]) / 2.0;
        var y = (this.oldy + p[1]) / 2.0;
        
        this.oldx = x;
        this.oldy = y;
        
        this.setPixel(x, y);
    }
    this.canvas.putImageData(this.imageData, 0, 0);
  }
}

register(ChaosServer, ChaosClient);

