/* Copyright 2015 Google Inc. All Rights Reserved.

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
const wallGeometry = require('wallGeometry');
const state = require('state');
const Rectangle = require('lib/rectangle');

var BALL_RADIUS = 50;

function makeBallData(x, y, vx, vy) {
  return {
    x: x || 0,
    y: y || 0,
    vx: vx || 0,
    vy: vy || 0
  };
}

function makeBoxPolygon(x, y, radius) {
  return new geometry.Polygon([
    {x: x - radius, y: y - radius},
    {x: x + radius, y: y - radius},
    {x: x + radius, y: y + radius},
    {x: x - radius, y: y + radius},
    {x: x - radius, y: y - radius}
  ]);
}

class BallsServer extends ModuleInterface.Server {
  constructor() {
    super();
    this.ballData = makeBallData();
  }

  willBeShownSoon() {
    var spawnRect = new Rectangle(
      wallGeometry.extents.x + BALL_RADIUS,
      wallGeometry.extents.y + BALL_RADIUS,
      wallGeometry.extents.w - 2*BALL_RADIUS,
      wallGeometry.extents.h - 2*BALL_RADIUS);
    
    // Choose a random starting location inside of our geo.
    do {
      this.ballData.x = Math.random() * spawnRect.w + spawnRect.x;
      this.ballData.y = Math.random() * spawnRect.h + spawnRect.y;
      
      // Generate this ball's collision box:
      var ballPolygon = makeBoxPolygon(this.ballData.x, this.ballData.y, BALL_RADIUS);
    } while (!geometry.isInsidePolygon(ballPolygon, wallGeometry));
    
    // Move the ball towards the center of the wall.
    var wallCenterX = wallGeometry.extents.x + wallGeometry.extents.w/2;
    var wallCenterY = wallGeometry.extents.y + wallGeometry.extents.h/2;
    
    this.ballData.vx = wallCenterX - this.ballData.x;
    this.ballData.vy = wallCenterY - this.ballData.y;
    // Ensure it's moving at 300px/sec
    var speed = Math.sqrt(this.ballData.vx * this.ballData.vx + 
                          this.ballData.vy * this.ballData.vy);
    this.ballData.vx *= 300/speed;
    this.ballData.vy *= 300/speed;
    
    state.create('balldata', {
      x: 'NumberLerpInterpolator',
      y: 'NumberLerpInterpolator',
      vx: 'ValueNearestInterpolator',
      vy: 'ValueNearestInterpolator'
    });
  }

  tick(time, delta) {
    var timeLeft = delta / 1000;
    
    // Handle all collisions.
    do {
      //debug('Trying to find first collision.', timeLeft);
      // Find the first collision in the timeLeft.
      do {
        // Move the ball.
        var newX = this.ballData.x + this.ballData.vx * timeLeft;
        var newY = this.ballData.y + this.ballData.vy * timeLeft;
    
        // Assert: We start inside the wall geometry.
        // If we move outside of it, flip the appropriate direction.
        var newBallPolygon = makeBoxPolygon(newX, newY, BALL_RADIUS);

        if (geometry.isInsidePolygon(newBallPolygon, wallGeometry)) {
          //debug('No collision found!', timeLeft);
          break;
        } else {
          // Figure out which line we are passing through...
          var intersection = geometry.intersectPolygonPolygon(newBallPolygon, wallGeometry);
          if (!intersection) {
            //debug('intersection error', newBallPolygon.extents.serialize(), wallGeometry.extents.serialize());
            throw new Error('We moved through the polygon, but couldn\'t find an intersection');
          }

          // We intersected. Start again at the original position, but move a
          // smaller amount.
          timeLeft *= 0.5;
        }
      } while (timeLeft > 0.001);
    
      // It's safe to move to newX, newY with no collisions.
      this.ballData.x = newX;
      this.ballData.y = newY;
    
      if (intersection) {
        //debug('Found a collision at ', intersection);
    
        // Respond to collision.
        var horiz = intersection.p1.y == intersection.p2.y;
        if (horiz) {
          this.ballData.vy *= -1;        
          //debug('Flipped y');
        } else {
          this.ballData.vx *= -1;
          //debug('Flipped x');
        }
        intersection = undefined;
      } else {
        break;
      }
    } while (true);
    
    state.get('balldata').set(this.ballData, time);
  }
}

class BallsClient extends ModuleInterface.Client {
  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    } 
  }

  willBeShownSoon(container, deadline) {
    const CanvasSurface = require('client/surface/canvas_surface');
    this.surface = new CanvasSurface(container, wallGeometry);
    this.canvas = this.surface.context;
  }

  draw(time, delta) {
    // Clear the screen.
    this.canvas.fillStyle = 'black';
    this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    
    var data = state.get('balldata');
    if (!data) {
      return;
    }
    var ballData = data.get(time - 100);
    if (!ballData) {
      // Wait a little bit.
      return;
    }

    // Push a transform.
    this.surface.pushOffset();
    
    this.canvas.fillStyle = 'red';
    this.canvas.beginPath();
    this.canvas.arc(ballData.x, ballData.y, BALL_RADIUS, 0, 2*Math.PI);
    this.canvas.closePath();
    this.canvas.fill();
    
    this.surface.popOffset();
  }
}

register(BallsServer, BallsClient);
