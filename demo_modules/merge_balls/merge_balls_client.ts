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

import { Client } from "../../client/modules/module_interface.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import {
  CurrentValueInterpolator,
  ModuleState,
  NumberLerpInterpolator,
  SharedState,
} from "../../client/network/state_manager.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { Ball } from "./ball.ts";

export function load(
  state: ModuleState,
  wallGeometry: Polygon,
) {
  //
  // Client Module
  //
  class MergeBallsClient extends Client {
    canvas!: CanvasRenderingContext2D;
    ballsState!: SharedState;
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    willBeShownSoon(container: HTMLElement) {
      const surface = new CanvasSurface(container, wallGeometry);
      this.surface = surface;
      this.canvas = surface.context;
      this.ballsState = state.define("balls", [{
        id: CurrentValueInterpolator,
        position: {
          x: NumberLerpInterpolator,
          y: NumberLerpInterpolator,
        },
        radius: NumberLerpInterpolator,
        color: CurrentValueInterpolator,
        velocity: {
          x: NumberLerpInterpolator,
          y: NumberLerpInterpolator,
        },
      }]);
    }

    draw(time: number) {
      this.canvas.fillStyle = "black";
      this.canvas.fillRect(
        0,
        0,
        this.surface!.virtualRect.w,
        this.surface!.virtualRect.h,
      );

      const balls = this.ballsState.get(time) as Ball[];

      if (!balls) {
        return;
      }

      // Draw the balls!
      const surface = this.surface as CanvasSurface;
      surface.pushOffset();

      // Draw the balls
      for (const ball of balls) {
        if (
          ball.radius > 0 && ball.position.x != null && ball.position.y != null
        ) {
          // Draw the ball
          this.canvas.fillStyle = ball.color.fill;
          this.canvas.beginPath();
          this.canvas.arc(
            ball.position.x,
            ball.position.y,
            0.9 * ball.radius,
            0,
            2 * Math.PI,
          );
          this.canvas.fill();
          this.canvas.lineWidth = 0.1 * ball.radius;
          this.canvas.strokeStyle = ball.color.edge;
          this.canvas.stroke();

          this.canvas.font = (ball.radius / 2).toFixed(0) + "px Arial";
          this.canvas.fillStyle = ball.color.edge;
          this.canvas.textAlign = "center";
          this.canvas.textBaseline = "middle";
          this.canvas.fillText(ball.id, ball.position.x, ball.position.y);
        }
      }

      surface.popOffset();
    }
  }
  return { client: MergeBallsClient };
}
