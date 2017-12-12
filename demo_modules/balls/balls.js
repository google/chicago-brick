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

var GOOGLE_COLORS = ['#3369E8', '#D50F25', '#EEB211', '#009925'];
var BALL_RADIUS = 50;
var NUM_BALLS = 200;

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

class BallsClient extends ModuleInterface.Client {
  constructor(config) {
    super();
    // We keep track of X data points.
    // Each data point is of the form (time, balls).
    // We lerp between the times to figure out what we are doing.
    this.balls = [];
    var client = this;
    network.on('balls', function handleBalls(balls) {
      var t = balls.time;
      // Lie about when the balls came in so that the draw method, which is 
      // running at 'now' can find any data.
      client.balls.push({time: t + 200, balls: balls.balls});
      // Trash data older than a second.
      while (client.balls[0].time < t - 1000) {
        client.balls.shift();
      }
    });
  }

  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
  }

  willBeShownSoon(container, deadline) {
    const CanvasSurface = require('client/surface/canvas_surface');
    this.surface = new CanvasSurface(container, wallGeometry);
    this.canvas = this.surface.context;
    return Promise.resolve();
  }

  draw(time, delta) {
    this.canvas.fillStyle = 'black';
    this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    
    // TODO(applmak): What are you thinking, Matt?
    // Find a time point that's roughly 300 ms behind the server.
    var foundI = -1;
    for (var i = 0; i < this.balls.length-1; ++i) {
      if (this.balls[i].time < time && time < this.balls[i+1].time) {
        foundI = i;
        break;
      }
    }
    if (foundI == -1) {
      return;
    }
    
    // Draw the balls!
    this.surface.pushOffset();
    
    var numBalls = this.balls[0].balls.length;
    for (var b = 0; b < numBalls; ++b) {
      var prevBall = this.balls[foundI].balls[b];
      var nextBall = this.balls[foundI+1].balls[b];
      var alpha = (time - this.balls[foundI].time) / (this.balls[foundI+1].time - this.balls[foundI].time);
      var ballPosition = {
        x: nextBall.x * alpha + prevBall.x * (1 - alpha),
        y: nextBall.y * alpha + prevBall.y * (1 - alpha)
      };
      this.canvas.fillStyle = GOOGLE_COLORS[prevBall.color];
      this.canvas.beginPath();
      this.canvas.arc(ballPosition.x, ballPosition.y, BALL_RADIUS, 0, 2*Math.PI);
      this.canvas.closePath();
      this.canvas.fill();
    }
    
    this.surface.popOffset();
  }
}

register(BallsServer, BallsClient);
