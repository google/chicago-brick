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

import { Client } from '/lib/module_interface.ts';
import {CanvasSurface} from '/client/surface/canvas_surface.js';

export function load(wallGeometry) {
  class GenlockTestClient extends Client {
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    async willBeShownSoon(container) {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.canvas = this.surface.context;

      // Despite the background and text colors changing, the rest of the text
      // styling doesn't need to change on each frame.
      this.canvas.textAlign = 'center';
      var fontHeight = Math.floor(this.surface.virtualRect.h / 10);
      this.canvas.font = fontHeight + 'px Helvetica';
      this.canvas.textBaseline = 'middle';
    }

    draw(time, delta) {
      var seconds = time / 1000;
      var nowIntSeconds = Math.floor(seconds);
      var lastIntSeconds = Math.floor(seconds - delta / 1000);
      if (nowIntSeconds != lastIntSeconds) {
        this.canvas.fillStyle = 'white';
      } else {
        this.canvas.fillStyle = 'black';
      }
      this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    }
  }
  return {client: GenlockTestClient};
}
