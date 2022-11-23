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
import {
  BALL_RADIUS,
  BallState,
  GOOGLE_COLORS,
  NUM_BALLS,
} from "./constants.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import { flip, sub } from "../../lib/math/vector2d.ts";
import * as randomjs from "https://esm.sh/random-js@2.1.0";
import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { doPhysics } from "../../lib/math/collision.ts";

const random = new randomjs.Random();

const ORIGIN_BALL_POLYGON = new Polygon([
  { x: -BALL_RADIUS, y: -BALL_RADIUS },
  { x: BALL_RADIUS, y: -BALL_RADIUS },
  { x: BALL_RADIUS, y: BALL_RADIUS },
  { x: -BALL_RADIUS, y: BALL_RADIUS },
]);

const ORIGIN_BALL_RECT = ORIGIN_BALL_POLYGON.extents;

export function load(wallGeometry: Polygon, state: ModuleState) {
  class BallsServer extends Server {
    readonly balls: BallState[] = [];
    willBeShownSoon() {
      const extents = wallGeometry.extents;
      const spawnRect = new Rectangle(
        extents.x + BALL_RADIUS,
        extents.y + BALL_RADIUS,
        extents.w - 2 * BALL_RADIUS,
        extents.h - 2 * BALL_RADIUS,
      );
      for (let i = 0; i < NUM_BALLS; ++i) {
        let ball: BallState;
        let ballPolygon: Polygon;
        do {
          ball = {
            x: random.real(spawnRect.x, spawnRect.x + spawnRect.w),
            y: random.real(spawnRect.y, spawnRect.y + spawnRect.h),
            vx: random.real(-1, 1, true),
            vy: random.real(-1, 1, true),
            color: random.integer(0, GOOGLE_COLORS.length - 1),
          };
          ballPolygon = ORIGIN_BALL_POLYGON.translate(ball);
        } while (!ballPolygon.isInsidePolygon(wallGeometry));
        this.balls.push(ball);
      }
    }

    tick(time: number, delta: number) {
      // Move the balls a bit.
      for (const ball of this.balls) {
        doPhysics(
          ball,
          ORIGIN_BALL_RECT,
          delta,
          wallGeometry,
          (ball, dt, newPos) => {
            newPos.x = ball.x + ball.vx * dt;
            newPos.y = ball.y + ball.vy * dt;
          },
          (ball, newPos, report) => {
            const segment = (report.objectSegment || report.wallSegment)!;
            const flippedV = flip(
              { x: ball.vx, y: ball.vy },
              sub(segment.b, segment.a),
            );
            ball.x = newPos.x;
            ball.y = newPos.y;
            ball.vx = flippedV.x;
            ball.vy = flippedV.y;
            ball.color = (ball.color + 1) % GOOGLE_COLORS.length;
          },
        );
      }

      state.store("balls", time, this.balls);
    }
  }

  return { server: BallsServer };
}
