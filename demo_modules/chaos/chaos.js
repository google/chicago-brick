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
    willBeShownSoon(container, deadline) {
        this.chaos = ['hello', 'world'];
        this.oldtime = -100000000;
        this.oldsend = -100000000;
        this.shapes = [];
        this.build = 0;
    }
    
    tick(time, delta) {
        var verbose = false;
        
        if (time > this.oldtime + (1000 * 60)) {
            this.oldtime = time;
            this.shapes = [];
            var numShapes = 40;
            var makeRadius = 0.30;
            for (var shapeCount = 0; shapeCount < numShapes; ) {
                var posx = wallGeometry.extents.w * Math.random();
                var posy = wallGeometry.extents.h * Math.random();
                var size = Math.min(wallGeometry.extents.w, wallGeometry.extents.h) * makeRadius;
                
                var fit = true;
                var nearest = wallGeometry.extents.w;
                for (var otherShape = 0; otherShape < shapeCount; ++otherShape) {
                    var myx = posx - this.shapes[otherShape].posx;
                    var myy = posy - this.shapes[otherShape].posy;
                    
                    var distSq = myx * myx + myy * myy;
                    var dist = Math.sqrt(distSq);
                    var newDist = dist - this.shapes[otherShape].size;
                    
                    nearest = Math.min(nearest, newDist);
                    
                    var rad = size + this.shapes[otherShape].size;
                    var radSq = rad * rad;
                    
                    if (distSq < radSq) {
                        fit = false;
                        makeRadius *= 0.99;
                        if (verbose) console.log("No fit " + makeRadius);
                        break;
                    }
                }
                if (fit) {
                
                    // make it as big as you can
                    var fit = (shapeCount > 2);
                    for (var count = 0; fit && count < 30; ++count) {
                        if (verbose) console.log("bigger " + count);
                        makeRadius *= 1.05;
                        size = Math.min(wallGeometry.extents.w, wallGeometry.extents.h) * makeRadius;
                        for (var otherShape = 0; otherShape < shapeCount; ++otherShape) {
                            var myx = posx - this.shapes[otherShape].posx;
                            var myy = posy - this.shapes[otherShape].posy;
                            
                            var distSq = myx * myx + myy * myy;
                            
                            var rad = size + this.shapes[otherShape].size;
                            var radSq = rad * rad;
                            
                            if (distSq < radSq) {
                                fit = false;
                                makeRadius /= 1.05;
                            }
                        }
                    }
                
                    if (verbose) console.log("Adding " + shapeCount);
                    var shape = {
                        posx: posx,
                        posy: posy,
                        size: size,
                    };
                    this.shapes[shapeCount] = shape;
                    shapeCount++;
                }
            }
            for (var shapeCount = 0; shapeCount < numShapes; ++shapeCount) {
                var myColorIndex = Math.floor((Math.random() * GOOGLE_COLORS.length));
                var alpha = Math.random() * 360.0; // degrees of random rotation to add
                var points = 3;
                do {
                    points = 3 + Math.floor((Math.random() * 10));
                } while (points == 4);
                
                var shape = this.shapes[shapeCount];
                shape.myColorIndex = myColorIndex;
                shape.alpha = alpha;
                shape.points = points;
            }
            this.build++;
        }
        if (time > this.oldsend + (1000)) {
            this.oldsend = time;
            network.emit('chaos', {
                time: this.build,
                shapes : this.shapes,
            });
        }
    }
}

class ChaosClient extends ModuleInterface.Client {

  constructor(config) {
    super();
    this.drawing = false;
    this.clientshape = [];
    var client = this;
    this.oldtime = 0;
    this.time = -666555;
    this.maxValue = 32;

    network.on('chaos', function handleChaos(data) {
      //client.chaos = data.chaos;
      if (client.time != data.time) {
          client.time = data.time;
          client.shapes = data.shapes;
          client.drawing = true;
          client.clientshape = [];
      }
    });
  }

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
  }
  
  initialize() {
    this.canvas.fillStyle = 'black';
    this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    this.raw.fill(0);
    var i = 0;
    for (var y = 0; y < this.surface.virtualRect.h; ++y) {
      for (var x = 0; x < this.surface.virtualRect.w; ++x) {
        this.imageData.data[i++] = 0;
        this.imageData.data[i++] = 0;
        this.imageData.data[i++] = 0;
        this.imageData.data[i++] = 255;
      }
    }
  }

  setPixel(x, y, shape) {
    x -= this.surface.virtualRect.x;
    y -= this.surface.virtualRect.y;
    if ((x < 0) || (y < 0) || (x >= this.surface.virtualRect.w) || (y >= this.surface.virtualRect.h)) return;
    x = parseInt(x, 10);
    y = parseInt(y, 10);
    var i = (y * this.surface.virtualRect.w + x) * 4;

    var v = this.raw[y * this.surface.virtualRect.w + x];
    if (v < this.maxValue - 1) {
        v++;
        this.raw[y * this.surface.virtualRect.w + x] = v;
        this.imageData.data[i++] = this.clientshape[shape].palette[v*3+0];
        this.imageData.data[i++] = this.clientshape[shape].palette[v*3+1];
        this.imageData.data[i++] = this.clientshape[shape].palette[v*3+2];
    }
  }
  
  toRadians (angle, shape) {
    return (this.shapes[shape].alpha + angle) * (Math.PI / 180);
  }

  position(count, shape) {
    var x = Math.cos(this.toRadians(360.0 * count / this.shapes[shape].points, shape)) * this.shapes[shape].size + (this.shapes[shape].posx);
    var y = Math.sin(this.toRadians(360.0 * count / this.shapes[shape].points, shape)) * this.shapes[shape].size + (this.shapes[shape].posy);
    return [x, y];
  }

  draw(time, delta) {
    if (!this.drawing) return;
    if (this.time != this.oldtime) {
        this.initialize();
        this.oldtime = this.time;
    }
    if (Math.random() < 0.001) {
        //this.initialize();
    }
    
    var client = this;
    
    for (var shape = 0; shape < this.shapes.length; ++shape) {
        if (!(shape in client.clientshape)) {
            client.clientshape[shape] = {};

            client.clientshape[shape].oldx = Math.floor((Math.random() * client.surface.virtualRect.w));
            client.clientshape[shape].oldy = Math.floor((Math.random() * client.surface.virtualRect.h));

            client.clientshape[shape].positions = new Array(client.shapes[shape].points);
            for (var p = 0; p < client.shapes[shape].points; ++p) {
                client.clientshape[shape].positions[p] = client.position(p, shape);    
            }
                        
            client.clientshape[shape].palette = new Array(client.maxValue * 3).fill(0);
            var myColor = client.hexToRgb(GOOGLE_COLORS[client.shapes[shape].myColorIndex]);
            for (var p = 0; p < client.maxValue; ++p)
            {
                client.clientshape[shape].palette[p*3+0] = Math.floor(myColor.r / (client.maxValue - 1) * p);
                client.clientshape[shape].palette[p*3+1] = Math.floor(myColor.g / (client.maxValue - 1) * p);
                client.clientshape[shape].palette[p*3+2] = Math.floor(myColor.b / (client.maxValue - 1) * p);
            }            
        }
        var steps = (this.shapes[shape].size * this.shapes[shape].size) / 40.0;
        if (this.shapes[shape].points == 3) {
            steps = steps / 10;
        }
        for (var intervals = 0; intervals < steps; intervals++) {
            var count = Math.floor((Math.random() * this.shapes[shape].points));
            var p = this.clientshape[shape].positions[count];

            try {
                var x = (this.clientshape[shape].oldx + p[0]) / 2.0;
                var y = (this.clientshape[shape].oldy + p[1]) / 2.0;
                
                this.clientshape[shape].oldx = x;
                this.clientshape[shape].oldy = y;
                
                this.setPixel(x, y, shape);
            }
            catch (e)
            {
                console.log(e);
                return;
            }
        }
    }
    this.canvas.putImageData(this.imageData, 0, 0);
  }
}

register(ChaosServer, ChaosClient);
