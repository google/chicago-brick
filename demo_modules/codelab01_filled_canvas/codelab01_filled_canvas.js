/* Copyright 2018 Google Inc. All Rights Reserved.

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

import {CanvasSurface} from '/client/surface/canvas_surface.js';

export function load(wallGeometry) {
  class Codelab01FilledCanvasClient {
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    willBeShownSoon(container, deadline) {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.canvas = this.surface.context;

      // Despite the background and text colors changing, the rest of the text
      // styling doesn't need to change on each frame.
      this.canvas.textAlign = 'center';
      const fontHeight = Math.floor(this.surface.virtualRect.h / 10);
      this.canvas.font = fontHeight + 'px Helvetica';
      this.canvas.textBaseline = 'middle';
      return Promise.resolve();
    }

    draw(time, delta) {
      this.canvas.fillStyle = 'blue';
      this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);

      this.canvas.fillStyle = 'red';
      this.canvas.fillText('Time: ' + time.toFixed(1), this.surface.virtualRect.w / 2, this.surface.virtualRect.h / 2);
    }
  }
  return {client: Codelab01FilledCanvasClient};
}
