/* Copyright 2019 Google Inc. All Rights Reserved.

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

import {P5Surface} from '/client/surface/p5_surface.js';

export function load(wallGeometry, asset) {
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

      this.backgroundColor = p5.color(120);

      this.tiles = [];
      for (let path in this.image_list_config) {
        let images = this.image_list_config[path];
        for (let i in images) {
          // TODO(jgessner): switch to functional style.
          let image = images[i];
          for (let x = 0; x < image.num_x_tiles; x++) {
            let tilePath = asset(path + image.name + '_tile-' + x + '_' + this.surface.virtualOffset.y + '.' + image.extension);
            this.tiles.push(p5.loadImage(tilePath));
          }
        }
      }
    }

    setup() {
      var p5 = this.p5;

      p5.noFill();
      p5.stroke(255, 0, 0);
      p5.strokeWeight(4);
      // Each instance will only ever draw images from one Y offset, but many X offsets.

      if (!this.tiles || !this.tiles.length) {
        return;
      }
      this.sum_tile_width = 0;
      for (let x = 0; x < this.tiles.length; x++) {
        this.sum_tile_width += this.tiles[x].width;
      }
      if (this.sum_tile_width < this.surface.wallRect.w) {
        let initial_sum_tile_width = this.sum_tile_width;
        while (this.sum_tile_width < this.surface.wallRect.w) {
          this.tiles = this.tiles.concat(this.tiles);
          this.sum_tile_width += initial_sum_tile_width;
        }
      }

      // Pre-draw the images off-screen so we don't need to load them or decode them while drawing.
      for (let i in this.tiles) {
        p5.image(this.tiles[i], -10000, -10000);
      }
    }

    draw(t) {
      var p5 = this.p5;

      if (this.tiles == null) {
        return;
      }

      if (this.surface.virtualOffset.y == null) {
        return;
      }

      // x_0 is the actual position that the first tile should be drawn at.
      // Make sure to draw integer pixel positions or performance will suffer.
      let x_0 = Math.floor((((t - this.surface.startTime) / 9) % (2*this.sum_tile_width)) - this.sum_tile_width);

      // for each iteration:
      // - translate x zero
      // - fit all of the tiles necessary into a given window (the overall width))
      // states:
      //  - only draw positive
      //  - draw negative and positive
      //  -
      // from all of the images, figure out the total width.  That strip will be the thing that cycles.

      // if sum of all image widths > wall width, identify the starting
      let x_offset = x_0;
      // walk backwards through the list to draw the tail end until we have no more of it.
      // Draw the "positive" images.
      const screen_right_edge = this.surface.virtualRect.x + this.surface.virtualRect.w;
      for (let x = 0; x < this.tiles.length; x++) {
        let image = this.tiles[x];
        let right_x = x_offset + image.width;
          // Do we need to draw this image?
          if ((x_offset >= this.surface.virtualRect.x && x_offset <= screen_right_edge) ||
              (right_x >= this.surface.virtualRect.x && right_x < screen_right_edge)) {
            p5.image(image, x_offset, this.surface.virtualRect.y);
          }
        x_offset += image.width;
      }

      if (x_0 < 0) {
        // need to fill in images on the right.
        while (x_offset < this.surface.wallRect.w) {
          for (let x = 0; x < this.tiles.length; x++) {
            let image = this.tiles[x];
            let right_x = x_offset + image.width;
              // Do we need to draw this image?
              if ((x_offset >= this.surface.virtualRect.x && x_offset <= screen_right_edge) ||
                  (right_x >= this.surface.virtualRect.x && right_x < screen_right_edge)) {
                p5.image(image, x_offset, this.surface.virtualRect.y);
              }
            x_offset += image.width;
          }
        }
      }

      if (x_0 > 0) {
        x_offset = x_0;
        for (let x = this.tiles.length - 1; x >= 0; x--) {
          let image = this.tiles[x];
          x_offset -= image.width;
          let right_x = x_offset + image.width;
            // Do we need to draw this image?
            if ((x_offset >= this.surface.virtualRect.x && x_offset <= screen_right_edge) ||
                (right_x >= this.surface.virtualRect.x && right_x < screen_right_edge)) {
              p5.image(image, x_offset, this.surface.virtualRect.y);
            }
        }
      }
    }
  }

  class BigImageCarouselClient {
    constructor(config) {
      this.config = config;
    }

    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    async willBeShownSoon(container, deadline) {
      this.surface = new P5Surface(container, wallGeometry, BigImageCarouselSketch, deadline, this.config);
    }

    draw(time) {
      this.surface.p5.draw(time);
    }
  }

  return {client: BigImageCarouselClient};
}
