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

const register = require('register');
const ModuleInterface = require('lib/module_interface');
const geometry = require('lib/geometry');
const wallGeometry = require('wallGeometry');
const network = require('network');
const debug = require('debug');


var numColumns = 184;
var numRows = 40;

class P5GameOfLifeServer extends ModuleInterface.Server {
  constructor(config) {
    super();
    debug('P5GameOfLife Server!', config);

    this.numTicks = 0;
    this.numTicksBetweenIterations = 2;

    this.gameBoard = new Array(numColumns);
    this.tmpBoard = new Array(numColumns);
    for (var i = 0; i < numColumns; i++) {
      this.gameBoard[i] = new Array(numRows);
      this.tmpBoard[i] = new Array(numRows);
    }
    for (i = 0; i < numColumns; i++) {
      for (var j = 0; j < numRows; j++) {
        // Lining the edges with 0s
        if (i === 0 || j === 0 || i == numColumns-1 || j == numRows-1) {
          this.gameBoard[i][j] = 0;
        } else {
          // Filling the rest randomly
          this.gameBoard[i][j] = Math.round(Math.random());
        }
        this.tmpBoard[i][j] = 0;
      }
    }
  }

  tick(time, delta) {
    this.numTicks++;

    if (this.numTicks % this.numTicksBetweenIterations !== 0) {
      return;
    }

    // Update the board and emit it.
    // Loop through every spot in our 2D array and check spots neighbors
    for (var x = 1; x < numColumns - 1; x++) {
      for (var y = 1; y < numRows - 1; y++) {
        // Add up all the states in a 3x3 surrounding grid
        var neighbors = 0;
        for (var i = -1; i <= 1; i++) {
          for (var j = -1; j <= 1; j++) {
            neighbors += this.gameBoard[x+i][y+j];
          }
        }

        // A little trick to subtract the current cell's state since
        // we added it in the above loop
        neighbors -= this.gameBoard[x][y];
        // Rules of Life
        if (this.gameBoard[x][y] == 1 && neighbors <  2) {
          // Died of loneliness.
          this.tmpBoard[x][y] = 0;
        } else if (this.gameBoard[x][y] == 1 && neighbors >  3) {
          // Died of overpopulation.
          this.tmpBoard[x][y] = 0;
        } else if (this.gameBoard[x][y] === 0 && neighbors == 3) {
          // Reproduction!
          this.tmpBoard[x][y] = 1;
        } else {
          // Stasis.
          this.tmpBoard[x][y] = this.gameBoard[x][y];
        }
      }
    }

    // Swap!
    var temp = this.gameBoard;
    this.gameBoard = this.tmpBoard;
    this.tmpBoard = temp;

    network.emit('board', {
      board : this.gameBoard,
    });
  }
}

// Create a polygon extending from x,y by w,h.
function makeCornerRectPolygon(x, y, w, h) {
  return new geometry.Polygon([
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
    this.cellWidth = surface.wallRect.w / numColumns;
    this.cellHeight = surface.wallRect.h / numRows;
    this.columns = 0;
    this.rows = 0;

    this.sizeOffset = new Array(numColumns);
    this.colorOffset = new Array(numColumns);
    for (var i = 0; i < numColumns; i++) {
      this.sizeOffset[i] = new Array(numRows);
      this.colorOffset[i] = new Array(numRows);
      for (var j = 0; j < numRows; j++) {
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
    this.visibleCells = new Array(numColumns);
    for (var i = 0; i < numColumns; i++) {
      this.visibleCells[i] = new Array(numRows);
    }
    for (i = 0; i < numColumns; i++) {
      for (var j = 0; j < numRows; j++) {
        var point = [i*this.cellWidth, j*this.cellHeight];
        var newPolygon = makeCornerRectPolygon(point[0], point[1], this.cellWidth, this.cellHeight);
        var visible = !!geometry.intersectPolygonPolygon(newPolygon, this.virtualRectPolygon) ||
             geometry.isInsidePolygon(newPolygon, this.virtualRectPolygon);
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
            this.sizeOffset[x][y] = this.cellWidth * p5.noise(t + x * numColumns + y);
            if (this.dominant_color === 0) {
              let newR = this.r + this.r * p5.noise(1000 + x * numColumns + y); 
              if (newR > 255) {
                newR = 255;
              }
              this.colorOffset[x][y] = p5.color(newR, this.g, this.b);
            } else if (this.dominant_color === 1) {
              let newG = this.r + this.r * p5.noise(1000 + x * numColumns + y); 
              if (newG > 255) {
                newG = 255;
              }
              this.colorOffset[x][y] = p5.color(this.r, newG, this.b);
            } else if (this.dominant_color == 2) {
              let newB = this.r + this.r * p5.noise(1000 + x * numColumns + y); 
              if (newB > 255) {
                newB = 255;
              }
              this.colorOffset[x][y] = p5.color(this.r, this.g, newB);
            }
          }
        }
      }
      for (var i = 0; i < numColumns; i++) {
        for ( var j = 0; j < numRows; j++) {
          if (this.visibleCells[i][j]  && board[i][j] == 1) {
            let size_offset = this.sizeOffset[i][j]; // this.cellWidth * p5.noise(t + i * numColumns + numRows);
            p5.fill(this.colorOffset[i][j]);
            p5.ellipse(i*this.cellWidth + this.cellWidth / 2, j*this.cellHeight + this.cellHeight / 2, this.cellWidth - size_offset, this.cellHeight - size_offset);
          }
        }
      }
      p5.fill(this.liveCellColor);
    }
  }
}

class P5GameOfLifeClient extends ModuleInterface.Client {
  constructor(config) {
    super();
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

  willBeShownSoon(container, deadline) {
    const P5Surface = require('client/surface/p5_surface');
    this.surface = new P5Surface(container, wallGeometry, P5GameOfLifeSketch, deadline);
    return Promise.resolve();
  }

  draw(time, delta) {
    this.surface.p5.draw(time, this.gameBoard);
  }
}

register(P5GameOfLifeServer, P5GameOfLifeClient);
