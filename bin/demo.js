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

/* jshint browser: true */
/* exported go */
const SIMPLE_GRID = [
  '111',
  '111',
  '111',
];
// const FULL_GRID = [
//   '1111001111110',
//   '0011111111000',
//   '0111111111111',
//   '1001111110110',
//   '0000001100000',
// ];
const DEFAULT_SCREEN_WIDTH = 1920;
const DEFAULT_SCREEN_HEIGHT = DEFAULT_SCREEN_WIDTH * 1080/1920;

// Stolen from util/location.js.
function getUriParams() {
  return location.search.substr(1).split(/&/g).reduce(function(obj, pair) {
    var bits = pair.split('=');
    var key = bits.shift();
    obj[key] = decodeURIComponent(bits.join('='));
    return obj;
  }, {});
}

function createFrameAt(x, y, screenWidth, screenHeight) {
  let frame = document.createElement('iframe');
  frame.width = screenWidth;
  frame.height = screenHeight;
  frame.frameBorder = 0;
  frame.src = `/?config=${x*1920},${y*1080},1920,1080`;
  return frame;
}

function createScreens(grid, xOffset, yOffset, screenWidth, screenHeight) {
  let container = document.getElementById('container');
  let rows = grid.length;
  let cols = grid[0].length;
  for (let row = 0; row < rows; row++) {
    let rowDiv = document.createElement('div');
    rowDiv.className = 'row';
    rowDiv.style.height = screenHeight + 'px';
    for (let col = 0; col < cols; col++) {
      let cellDiv = document.createElement('div');
      cellDiv.className = 'cell';
      cellDiv.style.width = screenWidth + 'px';
      cellDiv.style.height = screenHeight + 'px';
      if (grid[row][col] == '1') {
        cellDiv.appendChild(createFrameAt(
            col + xOffset, row + yOffset, screenWidth, screenHeight));
      }
      rowDiv.appendChild(cellDiv);
    }
    container.appendChild(rowDiv);
  }
}

function go() {  // eslint-disable-line no-unused-vars
  let params = getUriParams();
  if ('hidecontrols' in params) {
    console.log('hiding controls');
    document.getElementById('controls').style.display = 'none';
  }
  let screenWidth = params.sw ?
      parseInt(params.sw, 10) : DEFAULT_SCREEN_WIDTH;
  let screenHeight = params.sh ?
      parseInt(params.sh, 10) : DEFAULT_SCREEN_HEIGHT;
  let grid = params.grid ?
      params.grid.split(',') : SIMPLE_GRID;
  let xOffset = params.xoffset ?
      parseInt(params.xoffset, 10) : 0;
  let yOffset = params.yoffset ?
      parseInt(params.yoffset, 10) : 0;
  createScreens(grid, xOffset, yOffset, screenWidth, screenHeight);
}
