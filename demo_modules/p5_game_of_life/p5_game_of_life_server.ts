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

import { NUM_COLUMNS, NUM_ROWS } from "./constants.ts";
import { Server } from "../../server/modules/module_interface.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";

export function load(network: ModuleWSS) {
  class P5GameOfLifeServer extends Server {
    numTicks = 0;
    numTicksBetweenIterations = 2;
    gameBoard: Array<number[]> = Array.from(
      { length: NUM_COLUMNS },
      (_, i) => {
        return Array.from({ length: NUM_ROWS }, (_, j) => {
          if (i === 0 || j === 0 || i == NUM_COLUMNS - 1 || j == NUM_ROWS - 1) {
            return 0;
          } else {
            // Filling the rest randomly
            return Math.round(Math.random());
          }
        });
      },
    );
    tmpBoard: Array<number[]> = Array.from({ length: NUM_COLUMNS }, () => {
      return Array.from({ length: NUM_ROWS }, () => 0);
    });

    tick() {
      this.numTicks++;

      if (this.numTicks % this.numTicksBetweenIterations !== 0) {
        return;
      }

      // Update the board and emit it.
      // Loop through every spot in our 2D array and check spots neighbors
      for (let x = 1; x < NUM_COLUMNS - 1; x++) {
        for (let y = 1; y < NUM_ROWS - 1; y++) {
          // Add up all the states in a 3x3 surrounding grid
          let neighbors = 0;
          for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
              neighbors += this.gameBoard[x + i][y + j];
            }
          }

          // A little trick to subtract the current cell's state since
          // we added it in the above loop
          neighbors -= this.gameBoard[x][y];
          // Rules of Life
          if (this.gameBoard[x][y] == 1 && neighbors < 2) {
            // Died of loneliness.
            this.tmpBoard[x][y] = 0;
          } else if (this.gameBoard[x][y] == 1 && neighbors > 3) {
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
      const temp = this.gameBoard;
      this.gameBoard = this.tmpBoard;
      this.tmpBoard = temp;

      network.send("board", {
        board: this.gameBoard,
      });
    }
  }

  return { server: P5GameOfLifeServer };
}
