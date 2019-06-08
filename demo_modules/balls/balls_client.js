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

import {GOOGLE_COLORS, BALL_RADIUS} from './constants.js';
import {CanvasSurface} from '/client/surface/canvas_surface.js';

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
    }

    draw(time) {
      this.canvas.fillStyle = 'black';
      this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);

      const ballsState = state.get('balls');
      if (!ballsState) {
        return;
      }
      const balls = ballsState.get(time - 100);

      if (!balls) {
        return;
      }

      // Draw the balls!
      this.surface.pushOffset();

      var numBalls = balls.length;
      for (var b = 0; b < numBalls; ++b) {
        this.canvas.fillStyle = GOOGLE_COLORS[balls[b].color];
        this.canvas.beginPath();
        this.canvas.arc(balls[b].x, balls[b].y, BALL_RADIUS, 0, 2*Math.PI);
        this.canvas.closePath();
        this.canvas.fill();
      }

      this.surface.popOffset();
    }
  }

  return {client: BallsClient};
}
