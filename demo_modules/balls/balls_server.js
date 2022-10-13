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

import {Polygon} from '../../lib/math/polygon2d.ts';
import {GOOGLE_COLORS, BALL_RADIUS, NUM_BALLS} from './constants.js';
import {Rectangle} from '../../lib/math/rectangle.ts';
import {add, sub, scale, copy, flip} from '../../lib/math/vector2d.ts';
import * as randomjs from 'https://esm.sh/random-js';

const random = new randomjs.Random();

function *zip(...args) {
  for (let i = 0; i < args[0].length; ++i) {
    yield args.map(a => a[i]);
  }
}

function min(arr, fn) {
  const minValue = Math.min(...arr.map(fn));
  return arr.find(v => fn(v) == minValue);
}


const ORIGIN_BALL_POLYGON = new Polygon([
  {x: -BALL_RADIUS, y: -BALL_RADIUS},
  {x: BALL_RADIUS, y: -BALL_RADIUS},
  {x: BALL_RADIUS, y: BALL_RADIUS},
  {x: -BALL_RADIUS, y: BALL_RADIUS},
]);

function findSoonestIntersection(oldCollision, newCollision, boundingPoly) {
  // Consider each point in the oldCollision and its corresponding new point
  // in the poly. Find the intersection of that segment with the boundingPoly.
  // If there are multiple hits, return the one that has the lowest u,
  // indicating that the position is closest to oldCollision.
  const intersections = [...zip(oldCollision.points, newCollision.points)]
      .map(pair => boundingPoly.intersectionWithSegment(...pair))
      .filter(i => i);
  return min(intersections, i => i.v);
}

function doPhysics(ball, dt, boundingPoly) {
  const v = {x: ball.vx, y: ball.vy};
  // First, ensure that the current position is fully inside of the boundingPoly.
  // If not, then we can't really fix that, so we'll just ensure that we are
  // heading toward the center of the wall... ish.
  const origCollision = ORIGIN_BALL_POLYGON.translate(ball);
  if (origCollision.isInsidePolygon(boundingPoly)) {
    // console.log('inside')
    let numTriedRemaining = 10;
    do {
      // Forward euler integration:
      const newPos = add(ball, scale(v, dt));

      // Is the new collision of this ball outside of the boundingPoly?
      const oldCollision = ORIGIN_BALL_POLYGON.translate(ball);
      const newCollision = ORIGIN_BALL_POLYGON.translate(newPos);
      const intersection = findSoonestIntersection(oldCollision, newCollision, boundingPoly);
      if (intersection) {
        // Well, we collided with the boundingPoly. If the normalized time unit at
        // which we bumped into the poly is less than some small amount, then we
        // are effectively on the poly already and have nothing to do. If not,
        // advance time until we are there.
        if (intersection.v > 0.001) {
          // console.log('hit', ball.x, ball.y, v, intersection);
          // Well, we collided with the boundingPoly. Advance time until the
          // collision happens.
          const cdt = dt * intersection.v;
          copy(ball, add(ball, scale(v, cdt)));
          // console.log('new', ball.x, ball.y);
          dt -= cdt;
        } else {
          // We hit basically where we started. This probably isn't good, we'd
          // ideally want to hit before then. Let's allow it for now.
          // TODO(applmak): Ensure that v is headed inside the polygon.
          copy(ball, newPos);
          break;
        }

        // Now, our collision is near enough the boundingPoly to respond.
        // One side of our collision geometry is on the boundingPoly. Figure
        // out which side that it by looking at the intersection results.
        const {a, b} = intersection;

        const base = sub(a, b);
        // Flip v over base.
        copy(v, flip(v, base));
        // Now, back to the top, this time, with a different dt and v.
        ball.color = (ball.color + 1) % GOOGLE_COLORS.length;
      } else {
        copy(ball, newPos);
        break;
      }

      // At this point, the ball should not really be intersecting with the
      // bounding poly. Due to numerical error that I'm too lazy to really fix,
      // it's still possible. Let's double-check.
      if (!ORIGIN_BALL_POLYGON.translate(ball).isInsidePolygon(boundingPoly)) {
        copy(ball, add(ball, scale(v, .01)));
        // console.log('huh', ball.x, ball.y);
      }
    } while (--numTriedRemaining);
  } else {
    // console.log('outside', ball.x, ball.y)
    const dest = boundingPoly.extents.center();
    const delta = sub(dest, ball);
    if (Math.sign(delta.x) != Math.sign(v.x)) {
      v.x *= -1;
    }
    if (Math.sign(delta.y) != Math.sign(v.y)) {
      v.y *= -1;
    }
    copy(ball, add(ball, scale(v, dt)));
  }

  ball.vx = v.x;
  ball.vy = v.y;

  if (ball.x > boundingPoly.extents.w || ball.y > boundingPoly.extents.h ||
      ball.x < 0 || ball.y < 0) {
    // console.error('WHOA NELLY:', ball.x, ball.y);
  }
}

export function load(wallGeometry, state) {
  class BallsServer {
    async willBeShownSoon() {
      this.balls = [];
      var extents = wallGeometry.extents;
      var spawnRect = new Rectangle(
        extents.x + BALL_RADIUS,
        extents.y + BALL_RADIUS,
        extents.w - 2 * BALL_RADIUS,
        extents.h - 2 * BALL_RADIUS);
      for (var i = 0; i < NUM_BALLS; ++i) {
        this.balls.push({
          x: random.real(spawnRect.x, spawnRect.x + spawnRect.w),
          y: random.real(spawnRect.y, spawnRect.y + spawnRect.h),
          vx: random.real(-1, 1, true),
          vy: random.real(-1, 1, true),
          color: random.integer(0, GOOGLE_COLORS.length-1),
        });
      }
    }

    tick(time, delta) {
      // Move the balls a bit.
      this.balls.forEach(ball => {
        // Calculate the new ball positions.
        doPhysics(ball, delta, wallGeometry);
      });

      state.store('balls', time, this.balls);
    }
  }

  return {server: BallsServer};
}
