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
const debug = require('debug');
const register = require('register');
const wallGeometry = require('wallGeometry');

class BigImageCarouselServer extends ModuleInterface.Server {
  constructor(config) {
    super();
    debug('BigImageCarousel Server!', config);
  }
}

// Create a polygon extending from x,y by w,h.
// p5 must be a P5.js instance.
class BigImageCarouselSketch {
  constructor(p5, surface, extraArgs) {
    this.p5 = p5;
    this.surface = surface;
    this.tiles = null; 

    this.image_list_config = extraArgs;
  }

  preload() {
    var p5 = this.p5;

    console.log('preload');

    this.y_index = this.surface.virtualRect.y / this.surface.virtualRect.h;

    console.log('screen with y_index ' + this.y_index);

    const asset = require('client/asset/asset');

    this.tiles = new Array(); 
    for (let path in this.image_list_config) {
      console.log('Path is ' + path);
      let images = this.image_list_config[path];
      for (let i in images) {
        let image = images[i];
        for (let x = 0; x < image.num_x_tiles; x++) {
          let tilePath = asset(path + image.name + '_tile_' + x + '_' + this.y_index + '.' + image.extension);
          console.log('tilePath is ' + tilePath);
          this.tiles.push(p5.loadImage(tilePath));
        }
      }
    }
  }

  setup() {
    var p5 = this.p5;

    console.log('setup()');

    p5.textSize(40);
    p5.fill(200, 0, 100);
    // Each instance will only ever draw images from one Y offset, but many X offsets.

    this.sum_tile_width = 0;
    for (let x = 0; x < this.tiles.length; x++) {
      this.sum_tile_width += this.tiles[x].width;
    }
    console.log('num tiles is ' + this.tiles.length);
    console.log('sum_tile_width is ' + this.sum_tile_width);
    if (this.sum_tile_width < this.surface.wallRect.w) {
      let initial_sum_tile_width = this.sum_tile_width;
      while (this.sum_tile_width < this.surface.wallRect.w) {
        this.tiles = this.tiles.concat(this.tiles);
        this.sum_tile_width += initial_sum_tile_width; 
        console.log('num tiles is ' + this.tiles.length);
        console.log('sum_tile_width is ' + this.sum_tile_width);
      }
    }
  }

  draw(t) {
    var p5 = this.p5;

    if (this.tiles == null) {
      console.log('Null tiles');
      return;
    }

    if (this.y_index == null) {
      console.log('null y_index');
      return;
    }

    p5.background(120);

    let x_zero = (((t - this.surface.startTime) / 9) % (2*this.sum_tile_width)) - this.sum_tile_width;

    // for each iteration:
    // - translate x zero 
    // - fit all of the tiles necessary into a given window (the overall width))
    // states:
    //  - only draw positive
    //  - draw negative and positive
    //  - 
    // from all of the images, figure out the total width.  That strip will be the thing that cycles.

    // if sum of all image widths > wall width, identify the starting 
    let x_offset = x_zero;
    // walk backwards through the list to draw the tail end until we have no more of it.
//    for (let x = 0; x
    // Draw the "positive" images.
    for (let x = 0; x < this.tiles.length; x++) {
      let image = this.tiles[x];
      let right_x = x_offset + image.width;
        // Do we need to draw this image?
        if ((x_offset >= this.surface.virtualRect.x &&
            x_offset <= this.surface.virtualRect.x + this.surface.virtualRect.w)
            ||
            (right_x >= this.surface.virtualRect.x &&
             right_x < this.surface.virtualRect.x + this.surface.virtualRect.w)) {
          p5.image(image, x_offset, this.surface.virtualRect.y);
        }
      x_offset += image.width;
    }

    if (x_zero < 0) {
      // need to fill in images on the right.
      while (x_offset < this.surface.wallRect.w) {
        for (let x = 0; x < this.tiles.length; x++) {
          let image = this.tiles[x];
          let right_x = x_offset + image.width;
            // Do we need to draw this image?
            if ((x_offset >= this.surface.virtualRect.x &&
                x_offset <= this.surface.virtualRect.x + this.surface.virtualRect.w)
                ||
                (right_x >= this.surface.virtualRect.x &&
                 right_x < this.surface.virtualRect.x + this.surface.virtualRect.w)) {
              p5.image(image, x_offset, this.surface.virtualRect.y);
            }
          x_offset += image.width;
        }
      }
    }

    if (x_zero > 0) {
      x_offset = x_zero;
      for (let x = this.tiles.length - 1; x >= 0; x--) {
        let image = this.tiles[x];
        x_offset -= image.width;
        let right_x = x_offset + image.width;
          // Do we need to draw this image?
          if ((x_offset >= this.surface.virtualRect.x &&
              x_offset <= this.surface.virtualRect.x + this.surface.virtualRect.w)
              ||
              (right_x >= this.surface.virtualRect.x &&
               right_x < this.surface.virtualRect.x + this.surface.virtualRect.w)) {
            p5.image(image, x_offset, this.surface.virtualRect.y);
          }
      }
    }
  }
}

class BigImageCarouselClient extends ModuleInterface.Client {
  constructor(config) {
    super();
    this.config = config;
    debug('BigImageCarousel Client!', config);
  }

  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
  }

  willBeShownSoon(container, deadline) {
    console.log('config in willBeShownSoon is ' + this.config);
    const P5Surface = require('client/surface/p5_surface');
    this.surface = new P5Surface(container, wallGeometry, BigImageCarouselSketch, deadline, this.config);
  }

  draw(time, delta) {
    this.surface.p5.draw(time);
  }
}

register(BigImageCarouselServer, BigImageCarouselClient);
