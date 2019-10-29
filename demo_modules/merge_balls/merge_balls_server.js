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

export function load(state, network, wallGeometry) {
  var NUM_BALLS = 10;
  var INITIAL_RADIUS = 150;

  //
  // Helper types & functions.
  //
  function makeRandomColor() {
      var c = '';
      while (c.length < 6) {
          c += (Math.random()).toString(16).substr(-6).substr(-1);
      }
      return '#'+c;
  }

  function shadeColor(color, percent) {
      // from SO post: http://stackoverflow.com/questions/5560248/programmatically-lighten-or-darken-a-hex-color-or-rgb-and-blend-colors
      var R = parseInt(color.substring(1,3),16);
      var G = parseInt(color.substring(3,5),16);
      var B = parseInt(color.substring(5,7),16);

      R = parseInt(R * (100 + percent) / 100);
      G = parseInt(G * (100 + percent) / 100);
      B = parseInt(B * (100 + percent) / 100);

      R = (R<255)?R:255;
      G = (G<255)?G:255;
      B = (B<255)?B:255;

      var RR = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
      var GG = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
      var BB = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));

      return "#"+RR+GG+BB;
  }

  class Ball {
    constructor(position, radius, color, velocity) {
      this.position = position;
      this.radius = radius;
      this.color = {
          fill: color,
          edge: shadeColor(color, -25)
      };
      this.velocity = velocity;
    }
    alive() {
      return this.radius > 0;
    }
    dead() {
      return !this.alive();
    }
    contains(ball) {
      // distance between ball centers
      var distance = Math.sqrt(Math.pow(this.position.x - ball.position.x, 2) +
                               Math.pow(this.position.y - ball.position.y, 2));

      if (this.radius == ball.radius) {
          // Balls overlapping at least 50% - this allows a ball to merge with
          // a ball of the exact same size (useful for starting with all balls
          // the same size).
          return distance <= ball.radius;
      } else if (this.radius > ball.radius) {
          // Is the target ball completely within this ball?
          return distance <= this.radius - ball.radius;
      }

      return false;
    }
    merge(ball) {
      // Merge balls weighting by area.
      var area = Math.PI * Math.pow(this.radius, 2);
      var ballArea = Math.PI * Math.pow(ball.radius, 2);

      var newArea = area + ballArea;

      this.velocity = {
          x: (this.velocity.x * area + ball.velocity.x * ballArea)/newArea,
          y: (this.velocity.y * area + ball.velocity.y * ballArea)/newArea,
      };

      this.radius = Math.sqrt(newArea/Math.PI);
      ball.radius = 0;
    }
  }

  //
  // Server Module
  //
  class MergeBallsServer {
    async willBeShownSoon() {
        function getInitialBallPosition(ballradius) {
            var rect = wallGeometry.extents;
            return {
              x: Math.random() * (rect.w - 2 * ballradius) + rect.x + ballradius,
              y: Math.random() * (rect.h  - 2 * ballradius) + rect.y + ballradius,
            };
        }

        function randomBallVelocity(speed) {
            var angle = Math.random() * 2 * Math.PI;

            return {
                x: speed * Math.cos(angle),
                y: speed * Math.sin(angle),
            };
        }

        this.balls = [];
        for (var b = 0; b < NUM_BALLS; ++b) {
            this.balls.push(new Ball(
                // position
                getInitialBallPosition(INITIAL_RADIUS),
                // radius
                INITIAL_RADIUS,
                // color
                makeRandomColor(),
                // velocity
                randomBallVelocity(Math.random() * 100 + 100)
            ));
        }
    }

    tick(time, delta) {
        // Move to new location.
        this.balls.map(function(ball) {
           if (ball.dead()) { return; }

           // New position (before bounding to display)
           var x = ball.position.x + ball.velocity.x * delta/1000;
           var y = ball.position.y + ball.velocity.y * delta/1000;

           if (x - ball.radius < wallGeometry.extents.x) {
               ball.velocity.x = Math.abs(ball.velocity.x);
           } else if (x  + ball.radius > wallGeometry.extents.x + wallGeometry.extents.w) {
               ball.velocity.x = -Math.abs(ball.velocity.x);
           }

           if (y - ball.radius < wallGeometry.extents.y) {
               ball.velocity.y = Math.abs(ball.velocity.y);
           } else if (y + ball.radius > wallGeometry.extents.y + wallGeometry.extents.h) {
               ball.velocity.y = -Math.abs(ball.velocity.y);
           }

           ball.position = { x: x, y: y };
        });

        // Merge balls
        for (var b = 0; b < this.balls.length; ++b) {
            var ballB = this.balls[b];

            // Try to merge all remaining balls.
            for (var t = b + 1; ballB.alive() && t < this.balls.length; ++t) {
                var ballT = this.balls[t];

                if (ballT.dead()) { continue; }

                if (ballB.contains(ballT)) {
                    ballB.merge(ballT);
                } else if (ballT.contains(ballB)) {
                    ballT.merge(ballB);
                }
            }
        }

        state.store('balls', time, this.balls);
    }
  }

  return {server: MergeBallsServer};
}
