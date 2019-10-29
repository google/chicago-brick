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

import {GOOGLE_COLORS, BALL_RADIUS} from './constants.js';
import {CanvasSurface} from '/client/surface/canvas_surface.js';
import {NumberLerpInterpolator, ValueNearestInterpolator} from '/lib/shared_state.js';

export function load(state, wallGeometry) {
  class BallsClient {
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    async willBeShownSoon(container) {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.canvas = this.surface.context;

      this.ballsState = state.define('balls', [{
        x: NumberLerpInterpolator,
        y: NumberLerpInterpolator,
        color: ValueNearestInterpolator,
      }]);
    }

    draw(time) {
      this.canvas.fillStyle = 'black';
      this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);

      const balls = this.ballsState.get(time);
      if (!balls) {
        return;
      }

      // Draw the balls!
      this.surface.pushOffset();

      for (const b of balls) {
        this.canvas.fillStyle = GOOGLE_COLORS[b.color];
        this.canvas.beginPath();
        this.canvas.arc(b.x, b.y, BALL_RADIUS, 0, 2*Math.PI);
        this.canvas.closePath();
        this.canvas.fill();
      }

      this.surface.popOffset();
    }
  }

  return {client: BallsClient};
}
