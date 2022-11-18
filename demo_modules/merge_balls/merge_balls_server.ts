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

import { Polygon } from "../../lib/math/polygon2d.ts";
import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Ball } from "./ball.ts";

export function load(
  state: ModuleState,
  wallGeometry: Polygon,
) {
  const INITIAL_RADIUS = 50;

  //
  // Helper types & functions.
  //
  function makeRandomColor() {
    let c = "";
    while (c.length < 6) {
      c += (Math.random()).toString(16).substr(-6).substr(-1);
    }
    return "#" + c;
  }
  //
  // Server Module
  //
  class MergeBallsServer extends Server {
    balls: Ball[] = [];
    willBeShownSoon() {
      function getInitialBallPosition(ballradius: number) {
        const rect = wallGeometry.extents;
        return {
          x: Math.random() * (rect.w - 2 * ballradius) + rect.x + ballradius,
          y: Math.random() * (rect.h - 2 * ballradius) + rect.y + ballradius,
        };
      }

      function randomBallVelocity(speed: number) {
        const angle = Math.random() * 2 * Math.PI;

        return {
          x: speed * Math.cos(angle),
          y: speed * Math.sin(angle),
        };
      }

      // Let's put one ball every so often on the screen.
      const NUM_BALLS = Math.min(
        wallGeometry.extents.w * wallGeometry.extents.h / 100 / 100,
        1000,
      );

      for (let b = 0; b < NUM_BALLS; ++b) {
        this.balls.push(
          new Ball(
            // position
            getInitialBallPosition(INITIAL_RADIUS),
            // radius
            INITIAL_RADIUS,
            // color
            makeRandomColor(),
            // velocity
            randomBallVelocity(Math.random() * 100 + 100),
          ),
        );
      }
    }

    tick(time: number, delta: number) {
      // Move to new location.
      this.balls.map(function (ball) {
        if (ball.dead()) return;

        // New position (before bounding to display)
        const x = ball.position.x + ball.velocity.x * delta / 1000;
        const y = ball.position.y + ball.velocity.y * delta / 1000;

        if (x - ball.radius < wallGeometry.extents.x) {
          ball.velocity.x = Math.abs(ball.velocity.x);
        } else if (
          x + ball.radius > wallGeometry.extents.x + wallGeometry.extents.w
        ) {
          ball.velocity.x = -Math.abs(ball.velocity.x);
        }

        if (y - ball.radius < wallGeometry.extents.y) {
          ball.velocity.y = Math.abs(ball.velocity.y);
        } else if (
          y + ball.radius > wallGeometry.extents.y + wallGeometry.extents.h
        ) {
          ball.velocity.y = -Math.abs(ball.velocity.y);
        }

        ball.position = { x: x, y: y };
      });

      // Merge balls
      for (let b = 0; b < this.balls.length; ++b) {
        const ballB = this.balls[b];

        // Try to merge all remaining balls.
        for (let t = b + 1; ballB.alive() && t < this.balls.length; ++t) {
          const ballT = this.balls[t];

          if (ballT.dead()) continue;

          if (ballB.contains(ballT)) {
            ballB.merge(ballT);
          } else if (ballT.contains(ballB)) {
            ballT.merge(ballB);
          }
        }
      }

      state.store("balls", time, this.balls);
    }
  }

  return { server: MergeBallsServer };
}
