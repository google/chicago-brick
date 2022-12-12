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
import { SpatialDatabase } from "../../lib/math/spatial_db.ts";
import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Ball } from "./ball.ts";
import { doPhysics } from "../../lib/math/collision.ts";
import { dot, flip, norm, rotCCW, sub } from "../../lib/math/vector2d.ts";

export function load(
  state: ModuleState,
  wallGeometry: Polygon,
) {
  const INITIAL_RADIUS = 50;

  const simpleWallPolygon = new Polygon([
    { x: wallGeometry.extents.x, y: wallGeometry.extents.y },
    {
      x: wallGeometry.extents.x + wallGeometry.extents.w,
      y: wallGeometry.extents.y,
    },
    {
      x: wallGeometry.extents.x + wallGeometry.extents.w,
      y: wallGeometry.extents.y + wallGeometry.extents.h,
    },
    {
      x: wallGeometry.extents.x,
      y: wallGeometry.extents.y + wallGeometry.extents.h,
    },
  ]);
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
    readonly db = new SpatialDatabase<Ball>(
      wallGeometry.extents,
      INITIAL_RADIUS * 8,
    );
    readonly balls: Ball[] = [];
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
        const ball = new Ball(
          String(b),
          // position
          getInitialBallPosition(INITIAL_RADIUS),
          // radius
          INITIAL_RADIUS,
          // color
          makeRandomColor(),
          // velocity
          randomBallVelocity(Math.random() * 100 + 100),
        );
        this.balls.push(ball);
        this.db.add(ball);
      }
    }

    tick(time: number, delta: number) {
      // Move to new location.
      for (const ball of this.balls) {
        if (ball.dead()) continue;

        doPhysics(
          ball.position,
          ball.extents.translate({ x: -ball.position.x, y: -ball.position.y }),
          delta / 1000,
          simpleWallPolygon,
          (pos, dt, newPos) => {
            newPos.x = pos.x + ball.velocity.x * dt;
            newPos.y = pos.y + ball.velocity.y * dt;
          },
          (pos, newPos, report) => {
            const segment = (report.objectSegment || report.wallSegment)!;

            // If our delta is in the same direction as the normal of the segment,
            // then we should not flip.
            const delta = sub(newPos, pos);
            const segmentDelta = sub(segment.b, segment.a);
            const normal = rotCCW(segmentDelta, Math.PI / 2);
            if (dot(norm(delta), norm(normal)) <= 0) {
              ball.velocity = flip(
                { x: ball.velocity.x, y: ball.velocity.y },
                segmentDelta,
              );
            }
            ball.position.x = pos.x = newPos.x;
            ball.position.y = pos.y = newPos.y;
          },
        );

        this.db.update(ball);
      }

      // Merge balls
      for (const ballB of this.balls) {
        if (ballB.dead()) {
          continue;
        }
        const nearbyBalls = this.db.get(ballB.extents);

        // Try to merge all remaining balls.
        for (const ballT of nearbyBalls) {
          if (ballT === ballB) {
            continue;
          }
          if (ballT.dead()) continue;

          if (ballB.contains(ballT) && ballB.radius >= ballT.radius) {
            ballB.merge(ballT);
            this.db.delete(ballT);

            // Maybe ballB is too big, and we should split it!
            if (
              ballB.radius > wallGeometry.extents.h / 4 || Math.random() < 0.01
            ) {
              const p = (ballB.radius - wallGeometry.extents.h / 4) /
                (wallGeometry.extents.h / 4);
              if (Math.random() < Math.max(p, 0.01)) {
                // Split the ball!
                const numAdditionalToSplitInto = Math.random() * 5 + 1;
                // Find some balls to split.
                const deadBalls: Ball[] = [];
                for (const ball of this.balls) {
                  if (ball.dead()) {
                    deadBalls.push(ball);
                    if (deadBalls.length >= numAdditionalToSplitInto) {
                      break;
                    }
                  }
                }
                const newBallRadius = Math.sqrt(
                  ballB.radius ** 2 / (deadBalls.length + 1),
                );
                const offsetAngle = Math.random() * 2 * Math.PI;
                // Pick some directions for the balls to go into.
                for (let i = 0; i < deadBalls.length; ++i) {
                  const angle = i / deadBalls.length * Math.PI * 2 +
                    offsetAngle;
                  const deadBall = deadBalls[i];
                  const dirX = Math.cos(angle);
                  const dirY = Math.sin(angle);
                  deadBall.velocity.x = dirX * 100.0;
                  deadBall.velocity.y = dirY * 100.0;
                  deadBall.position.x = ballB.position.x + dirX * ballB.radius;
                  deadBall.position.y = ballB.position.y + dirY * ballB.radius;
                  // This makes the balls live again.
                  deadBall.radius = newBallRadius;
                  // It was deleted.. add it back in.
                  this.db.add(deadBall);
                }

                ballB.radius = newBallRadius;
              }
            }

            this.db.update(ballB);
          }
        }
      }

      // Merging / splitting might move the balls in weird ways, like
      // outside of our wall extents.
      const wallCenter = wallGeometry.extents.center();
      for (const ball of this.balls) {
        // If we are not inside, force the ball v to move us closer to inside.
        if (!wallGeometry.extents.isInside(ball.position)) {
          // Move the ball velocity towards the center of the wall.
          const delta = sub(wallCenter, ball.position);
          if (Math.sign(delta.x) != Math.sign(ball.velocity.x)) {
            ball.velocity.x *= -1;
          }
          if (Math.sign(delta.y) != Math.sign(ball.velocity.y)) {
            ball.velocity.y *= -1;
          }
        }
      }

      state.store("balls", time, this.balls.filter((b) => b.alive()));
    }
  }

  return { server: MergeBallsServer };
}
