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

import {NUM_ROWS, NUM_COLUMNS} from './constants.js';
import {Server} from '../../server/modules/module_interface.ts';

export function load(network, debug) {
  class P5GameOfLifeServer extends Server {
    constructor(config) {
      super(config);
      debug('P5GameOfLife Server!', config);

      this.numTicks = 0;
      this.numTicksBetweenIterations = 2;

      this.gameBoard = new Array(NUM_COLUMNS);
      this.tmpBoard = new Array(NUM_COLUMNS);
      for (var i = 0; i < NUM_COLUMNS; i++) {
        this.gameBoard[i] = new Array(NUM_ROWS);
        this.tmpBoard[i] = new Array(NUM_ROWS);
      }
      for (i = 0; i < NUM_COLUMNS; i++) {
        for (var j = 0; j < NUM_ROWS; j++) {
          // Lining the edges with 0s
          if (i === 0 || j === 0 || i == NUM_COLUMNS-1 || j == NUM_ROWS-1) {
            this.gameBoard[i][j] = 0;
          } else {
            // Filling the rest randomly
            this.gameBoard[i][j] = Math.round(Math.random());
          }
          this.tmpBoard[i][j] = 0;
        }
      }
    }

    tick() {
      this.numTicks++;

      if (this.numTicks % this.numTicksBetweenIterations !== 0) {
        return;
      }

      // Update the board and emit it.
      // Loop through every spot in our 2D array and check spots neighbors
      for (var x = 1; x < NUM_COLUMNS - 1; x++) {
        for (var y = 1; y < NUM_ROWS - 1; y++) {
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

      network.send('board', {
        board : this.gameBoard,
      });
    }
  }

  return {server: P5GameOfLifeServer};
}
