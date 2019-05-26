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

const register = require('register');
const ModuleInterface = require('lib/module_interface');
const geometry = require('lib/geometry');
const Rectangle = require('lib/rectangle');

const network = require('network');
const wallGeometry = require('wallGeometry');

const {GOOGLE_COLORS, BALL_RADIUS, NUM_BALLS} = require('./constants');

class BallsServer extends ModuleInterface.Server {
  willBeShownSoon(container, deadline) {
    this.balls = [];
    var extents = wallGeometry.extents;
    var spawnRect = new Rectangle(
      extents.x + BALL_RADIUS,
      extents.y + BALL_RADIUS,
      extents.w - 2 * BALL_RADIUS,
      extents.h - 2 * BALL_RADIUS);
    for (var i = 0; i < NUM_BALLS; ++i) {
      this.balls.push({
        x: Math.random() * spawnRect.w + spawnRect.x,
        y: Math.random() * spawnRect.h + spawnRect.y,
        vx: Math.random()*2-1,
        vy: Math.random()*2-1,
        color: Math.floor(GOOGLE_COLORS.length * Math.random())
      });
    }
    return Promise.resolve();
  }

  tick(time, delta) {
    // Move the balls a bit.
    this.balls.forEach(function(ball, index) {
      var nx = ball.x + ball.vx * delta / 2.0;
      var ny = ball.y + ball.vy * delta / 2.0;

      var newPolygon = BallsServer.makeBoxPolygon(nx, ny, BALL_RADIUS);

      // Algorithm for detection & collision response:
      // IF the old polygon was inside AND
      //    the new polygon is not inside
      //    THEN: we need to respond
      // BUT we can assume that all balls start inside.

      // If we are moving outside of the wall...
      if (!geometry.isInsidePolygon(newPolygon, wallGeometry)) {
        // Figure out which line we are passing through...
        var intersection = geometry.intersectPolygonPolygon(newPolygon, wallGeometry);
        if (intersection) {
          // We definitely need to flip, because we are leaving the wall.
          // Figure out if this is a horizontal line.
          var horiz = intersection.p1.y == intersection.p2.y;
          // Change the velocity...
          if (horiz) {
            ball.vy *= -1;
          } else {
            ball.vx *= -1;
          }
          // Update color
          ball.color = (ball.color + 1) % GOOGLE_COLORS.length;

          // Recalc position.
          nx = ball.x + ball.vx * delta / 10.0;
          ny = ball.y + ball.vy * delta / 10.0;
        }
      }

      ball.x = nx;
      ball.y = ny;
    });

    network.emit('balls', {time: time, balls: this.balls});
  }

  static makeBoxPolygon(x, y, radius) {
    return new geometry.Polygon([
      {x: x - radius, y: y - radius},
      {x: x + radius, y: y - radius},
      {x: x + radius, y: y + radius},
      {x: x - radius, y: y + radius},
      {x: x - radius, y: y - radius},
    ]);
  }
}

register(BallsServer, null);
