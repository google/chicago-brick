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

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
  } : null;
}

const GOOGLE_COLORS = ['#3369e8', '#d50f25', '#eeb211', '#009925', '#FFFFFF'].map(hexToRgb);

// Set to true to enable console spam!
const VERBOSE = false;

// Number of shapes to create each time we try to create shapes.
const NUM_SHAPES = 40;

class ChaosServer extends ModuleInterface.Server {
  willBeShownSoon(container, deadline) {
    // The time we last tried to place a new shape.
    this.oldtime = -Infinity;
    // The time we last sent information to the clients about the shapes.
    this.oldsend = -Infinity;
    // The shape data.
    this.shapes = [];
    // A counter indicating how many times we've added shapes.
    this.build = 0;
  }
    
  tick(time, delta) {
    if (time > this.oldtime + (1000 * 60)) {
      this.oldtime = time;
      // Reset shape data (effectively blanking the screen).
      this.shapes = [];
      // Initial size of shape to make. If we can't find a fit, we decrease this and try again.
      let makeRadius = 0.30;
      
      // Make NUM_SHAPES shapes! Don't increment shapeCount unless we find a place to put a shape.
      // TODO(applmak): This has the potential to run forever, and be the cause of the issues with
      // this module. Rather than running forever, switch it to try no more than 1000 times or
      // some such.
      for (let shapeCount = 0; shapeCount < NUM_SHAPES; ) {
        const posx = wallGeometry.extents.w * Math.random();
        const posy = wallGeometry.extents.h * Math.random();
        let size = Math.min(wallGeometry.extents.w, wallGeometry.extents.h) * makeRadius;
      
        // Presume that this is going to fit just fine, then try all the other shapes we made in
        // an attempt to find any overlap.
        let fit = true;
        for (let otherShape = 0; otherShape < shapeCount; ++otherShape) {
          const myx = posx - this.shapes[otherShape].posx;
          const myy = posy - this.shapes[otherShape].posy;
        
          const distSq = myx * myx + myy * myy;
          const dist = Math.sqrt(distSq);
          const newDist = dist - this.shapes[otherShape].size;
          const rad = size + this.shapes[otherShape].size;
          const radSq = rad * rad;
        
          // Check to ensure that our new shape isn't too close to any shape we made so far.
          if (distSq < radSq) {
            // If it is, we decrease our size, abort the overlap check, and try again.
            fit = false;
            makeRadius *= 0.99;
            if (VERBOSE) console.log("No fit " + makeRadius);
            break;
          }
        }
        if (fit) {
          // Maybe our initial guess as to the size was too conservative. Make it bigger, see if it still fits.
          let fit = (shapeCount > 2);
          // Try to make it bigger 30 times.
          for (let count = 0; fit && count < 30; ++count) {
            if (VERBOSE) console.log("bigger " + count);
            makeRadius *= 1.05;
            size = Math.min(wallGeometry.extents.w, wallGeometry.extents.h) * makeRadius;
            // TODO(applmak): This check against existing shapes is similar to the other one.
            // Extract it as a function.
            for (let otherShape = 0; otherShape < shapeCount; ++otherShape) {
              const myx = posx - this.shapes[otherShape].posx;
              const myy = posy - this.shapes[otherShape].posy;
            
              const distSq = myx * myx + myy * myy;
            
              const rad = size + this.shapes[otherShape].size;
              const radSq = rad * rad;
            
              if (distSq < radSq) {
                fit = false;
                makeRadius /= 1.05;
                // TODO(applmak): This undo-ing of the radius isn't applied to the size, so
                // we should fix that here.
              }
            }
          }
    
          if (VERBOSE) console.log("Adding " + shapeCount);
          var shape = {posx, posy, size};
          this.shapes[shapeCount] = shape;
          shapeCount++;
        }
      }
      // We placed NUM_SHAPES shapes!
      for (let shapeCount = 0; shapeCount < NUM_SHAPES; ++shapeCount) {
        const myColorIndex = Math.floor((Math.random() * GOOGLE_COLORS.length));
        const alpha = Math.random() * 360.0; // degrees of random rotation to add
        // Pick a number of points for this shape. 4 is a boring number of points (solid square), so
        // if we pick 4, try again.
        let points = 3;
        do {
          points = 3 + Math.floor((Math.random() * 10));
        } while (points == 4);
      
        const shape = this.shapes[shapeCount];
        shape.myColorIndex = myColorIndex;
        shape.alpha = alpha;
        shape.points = points;
      }
      this.build++;
    }
    
    // Send information about the layout of the wall to the clients.
    if (time > this.oldsend + (1000)) {
      this.oldsend = time;
      network.emit('chaos', {
        time: this.build,
        shapes : this.shapes,
      });
    }
  }
}

// Maximum value in a particular pixel.
const MAX_VALUE = 32;

class ChaosClient extends ModuleInterface.Client {

  constructor(config) {
    super();
    // Boolean that prevents drawing until we have data from the client.
    // TODO(applmak): This is redundant with clientshape.length. Remove it.
    this.drawing = false;
    // The server layout
    this.shapes = [];

    this.clientshape = [];
    
    // When we are good to draw and this doesn't match 'time', we blank the canvas.
    this.oldtime = 0;
    // The number of the server layout, monotonically increasing.
    this.time = -Infinity;

    network.on('chaos', data => {
      // If the server has chosen a new layout, update the client layout.
      if (this.time != data.time) {
        this.time = data.time;
        this.shapes = data.shapes;
        this.drawing = true;
        this.clientshape = [];
      }
    });
  }

  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
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
    let i = 0;
    for (let y = 0; y < this.surface.virtualRect.h; ++y) {
      for (let x = 0; x < this.surface.virtualRect.w; ++x) {
        this.imageData.data[i++] = 0;
        this.imageData.data[i++] = 0;
        this.imageData.data[i++] = 0;
        this.imageData.data[i++] = 255;
      }
    }
  }

  // Sets a pixel in the canvas to the color associated with the specified shape.
  setPixel(x, y, shape) {
    x -= this.surface.virtualRect.x;
    y -= this.surface.virtualRect.y;
    if ((x < 0) || (y < 0) || (x >= this.surface.virtualRect.w) || (y >= this.surface.virtualRect.h)) return;
    // TODO(applmak): I think that this trying to round x and y, so replace this with Math.floor.
    x = parseInt(x, 10);
    y = parseInt(y, 10);
    // Calculate this pixel's index in the array (accounting for the 4 color channels).
    let i = (y * this.surface.virtualRect.w + x) * 4;

    // Only allow this pixel to be colored MAX_VALUE - 1 times.
    let v = this.raw[y * this.surface.virtualRect.w + x];
    if (v < MAX_VALUE - 1) {
        v++;
        this.raw[y * this.surface.virtualRect.w + x] = v;
        this.imageData.data[i++] = this.clientshape[shape].palette[v*3+0];
        this.imageData.data[i++] = this.clientshape[shape].palette[v*3+1];
        this.imageData.data[i++] = this.clientshape[shape].palette[v*3+2];
    }
  }
  
  // Helper method to convert an angle in degrees in object space into radians in screen space.
  toRadians(angle, shape) {
    return (this.shapes[shape].alpha + angle) * (Math.PI / 180);
  }

  // Helper method to convert an index into the vertices of a shape into the position of that vertex in screen space.
  position(count, shape) {
    const x = Math.cos(this.toRadians(360.0 * count / this.shapes[shape].points, shape)) * this.shapes[shape].size + (this.shapes[shape].posx);
    const y = Math.sin(this.toRadians(360.0 * count / this.shapes[shape].points, shape)) * this.shapes[shape].size + (this.shapes[shape].posy);
    return [x, y];
  }

  draw(time, delta) {
    if (!this.drawing) return;
    if (this.time != this.oldtime) {
      this.initialize();
      this.oldtime = this.time;
    }
    
    for (let shape = 0; shape < this.shapes.length; ++shape) {
      if (!(shape in this.clientshape)) {
        // If we have some shape data from the server that we haven't initialized yet, initialize it.
        this.clientshape[shape] = {};

        // Pick a random point on the surface of the wall to begin.
        this.clientshape[shape].oldx = Math.floor((Math.random() * this.surface.virtualRect.w));
        this.clientshape[shape].oldy = Math.floor((Math.random() * this.surface.virtualRect.h));

        // Cache the positions of the shape vertex.
        this.clientshape[shape].positions = new Array(this.shapes[shape].points);
        for (let p = 0; p < this.shapes[shape].points; ++p) {
            this.clientshape[shape].positions[p] = this.position(p, shape);    
        }

        // Calculate a palette for this shape.
        this.clientshape[shape].palette = new Array(MAX_VALUE * 3).fill(0);
        const myColor = GOOGLE_COLORS[this.shapes[shape].myColorIndex];
        for (let p = 0; p < MAX_VALUE; ++p)
        {
          this.clientshape[shape].palette[p*3+0] = Math.floor(myColor.r / (MAX_VALUE - 1) * p);
          this.clientshape[shape].palette[p*3+1] = Math.floor(myColor.g / (MAX_VALUE - 1) * p);
          this.clientshape[shape].palette[p*3+2] = Math.floor(myColor.b / (MAX_VALUE - 1) * p);
        }
      }
      // Time to draw! Pick a number of points we should add during this tick.
      let steps = (this.shapes[shape].size * this.shapes[shape].size) / 4.0;
      if (this.shapes[shape].points == 3) {
        steps = steps / 10;
      }
      for (let intervals = 0; intervals < steps; intervals++) {
        // Actually do the chaos simulation:
        // Pick a point, move halfway there, mark it.
        const count = Math.floor((Math.random() * this.shapes[shape].points));
        const p = this.clientshape[shape].positions[count];

        // TODO(applmak): Is this try-catch necessary?
        try {
          const x = (this.clientshape[shape].oldx + p[0]) / 2.0;
          const y = (this.clientshape[shape].oldy + p[1]) / 2.0;
          
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
