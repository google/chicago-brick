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

import {Polygon} from '/lib/math/polygon2d.js';
import {NUM_ROWS, NUM_COLUMNS} from './constants.js';
import {P5Surface} from '/client/surface/p5_surface.js';

export function load(wallGeometry, network, debug) {

  // Create a polygon extending from x,y by w,h.
  function makeCornerRectPolygon(x, y, w, h) {
    return new Polygon([
      {x: x, y: y},
      {x: x + w, y: y},
      {x: x + w, y: y + h},
      {x: x, y: y + h},
      {x: x, y: y},
    ]);
  }

  // p5 must be a P5.js instance.
  class P5GameOfLifeSketch {
    constructor(p5, surface) {
      this.p5 = p5;
      this.surface = surface;
      this.cellWidth = surface.wallRect.w / NUM_COLUMNS;
      this.cellHeight = surface.wallRect.h / NUM_ROWS;
      this.columns = 0;
      this.rows = 0;

      this.sizeOffset = new Array(NUM_COLUMNS);
      this.colorOffset = new Array(NUM_COLUMNS);
      for (var i = 0; i < NUM_COLUMNS; i++) {
        this.sizeOffset[i] = new Array(NUM_ROWS);
        this.colorOffset[i] = new Array(NUM_ROWS);
        for (var j = 0; j < NUM_ROWS; j++) {
          this.sizeOffset[i][j] = 0;
          this.colorOffset[i][j] = 0;
        }
      }
    }

    setup() {
      // TODO(jgessner): cycle through different shapes and images instead of just rectangles.
      var p5 = this.p5;

      // Sketch-specific setup.
      this.columns = p5.floor(p5.wallWidth / this.cellWidth);
      this.rows = p5.floor(p5.wallHeight / this.cellHeight);
      // TODO(jgessner): coordinate with applmak on what functionality for bounds checking should be available to all surfaces.
      this.virtualRectPolygon = makeCornerRectPolygon(this.surface.virtualRect.x,
          this.surface.virtualRect.y, this.surface.virtualRect.w, this.surface.virtualRect.h);

      this.emptyCellColor = p5.color(p5.random(255), p5.random(255), p5.random(255));
      p5.background(this.emptyCellColor);
      this.r = p5.random(255);
      this.g = p5.random(255);
      this.b = p5.random(255);

      this.dominant_color = 0;
      if (this.r > this.g && this.r > this.b) {
        this.dominant_color = 0;
      } else if (this.g > this.r && this.g > this.b) {
        this.dominant_color = 1;
      } else if (this.b > this.r && this.b > this.r) {
        this.dominant_color = 2;
      }

      this.liveCellColor = p5.color(this.r, this.g, this.b);
      p5.fill(this.liveCellColor);

      p5.noStroke();
      p5.ellipseMode(p5.CENTER);

      // Pre-calculate which cells are visible for this client.
      this.visibleCells = new Array(NUM_COLUMNS);
      for (var i = 0; i < NUM_COLUMNS; i++) {
        this.visibleCells[i] = new Array(NUM_ROWS);
      }
      for (i = 0; i < NUM_COLUMNS; i++) {
        for (var j = 0; j < NUM_ROWS; j++) {
          var point = [i*this.cellWidth, j*this.cellHeight];
          var newPolygon = makeCornerRectPolygon(point[0], point[1], this.cellWidth, this.cellHeight);
          var visible = !!newPolygon.intersectionWithPolygon(this.virtualRectPolygon) ||
               newPolygon.isInsidePolygon(this.virtualRectPolygon);
          this.visibleCells[i][j] = visible;
        }
      }

      this.frame_count = 0;
    }

    draw(t, board) {
      var p5 = this.p5;

      this.frame_count++;

      if (board) {
        p5.background(this.emptyCellColor);
        if (this.frame_count % 9 === 0) {
          this.size_offset = this.cellWidth * p5.noise(t);
          for (var x in this.sizeOffset) {
            for (var y in this.sizeOffset[x]) {
              this.sizeOffset[x][y] = this.cellWidth * p5.noise(t + x * NUM_COLUMNS + y);
              if (this.dominant_color === 0) {
                let newR = this.r + this.r * p5.noise(1000 + x * NUM_COLUMNS + y);
                if (newR > 255) {
                  newR = 255;
                }
                this.colorOffset[x][y] = p5.color(newR, this.g, this.b);
              } else if (this.dominant_color === 1) {
                let newG = this.r + this.r * p5.noise(1000 + x * NUM_COLUMNS + y);
                if (newG > 255) {
                  newG = 255;
                }
                this.colorOffset[x][y] = p5.color(this.r, newG, this.b);
              } else if (this.dominant_color == 2) {
                let newB = this.r + this.r * p5.noise(1000 + x * NUM_COLUMNS + y);
                if (newB > 255) {
                  newB = 255;
                }
                this.colorOffset[x][y] = p5.color(this.r, this.g, newB);
              }
            }
          }
        }
        for (var i = 0; i < NUM_COLUMNS; i++) {
          for ( var j = 0; j < NUM_ROWS; j++) {
            if (this.visibleCells[i][j]  && board[i][j] == 1) {
              let size_offset = this.sizeOffset[i][j]; // this.cellWidth * p5.noise(t + i * NUM_COLUMNS + NUM_ROWS);
              p5.fill(this.colorOffset[i][j]);
              p5.ellipse(i*this.cellWidth + this.cellWidth / 2, j*this.cellHeight + this.cellHeight / 2, this.cellWidth - size_offset, this.cellHeight - size_offset);
            }
          }
        }
        p5.fill(this.liveCellColor);
      }
    }
  }

  class P5GameOfLifeClient {
    constructor(config) {
      debug('P5GameOfLife Client!', config);
      this.image = null;
      this.surface = null;
      this.gameBoard = null;

      var client = this;
      network.on('board', function handleBoard(data) {
        client.gameBoard = data.board;
      });
    }

    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    async willBeShownSoon(container, deadline) {
      this.surface = new P5Surface(container, wallGeometry, P5GameOfLifeSketch, deadline);
    }

    draw(time) {
      this.surface.p5.draw(time, this.gameBoard);
    }
  }

  return {client: P5GameOfLifeClient};
}
