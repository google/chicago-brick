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
import {CanvasSurface} from '/client/surface/canvas_surface.ts';
import {NumberLerpInterpolator} from '/client/network/state_manager.ts';

export function load(state, network, wallGeometry, debug) {
  //
  // Client Module
  //
  class MergeBallsClient extends Client {
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    async willBeShownSoon(container) {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.canvas = this.surface.context;
      this.ballsState = state.define('balls', [{
          position: {
            x: NumberLerpInterpolator,
            y: NumberLerpInterpolator
          },
          radius: NumberLerpInterpolator,
          color: (t, k, v) => v,
          velocity: {
            x: NumberLerpInterpolator,
            y: NumberLerpInterpolator
          }
      }]);
    }

    draw(time) {
      this.canvas.fillStyle = 'black';
      this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);

      var balls = this.ballsState.get(time);

      if (!balls ) {
        debug("Whoa! at time: ", time);
        return;
      }

      // Draw the balls!
      this.surface.pushOffset();

      // Draw the balls
      for (var b = 0; b < balls.length; ++b) {
          var ball = balls[b];

          if (ball.radius > 0) {
              // Draw the ball
              this.canvas.fillStyle = ball.color.fill;
              this.canvas.beginPath();
              this.canvas.arc(ball.position.x, ball.position.y, 0.9*ball.radius, 0, 2 * Math.PI);
              this.canvas.fill();
              this.canvas.lineWidth = 0.1 * ball.radius;
              this.canvas.strokeStyle = ball.color.edge;
              this.canvas.stroke();

              this.canvas.font = (ball.radius / 2).toFixed(0) + "px Arial";
              this.canvas.fillStyle = ball.color.edge;
              this.canvas.textAlign = "center";
              this.canvas.textBaseline = "middle";
              this.canvas.fillText(b.toString(), ball.position.x, ball.position.y);
          }
      }

      this.surface.popOffset();
    }
  }
  return {client: MergeBallsClient};
}
