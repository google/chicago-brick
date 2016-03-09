var NUM_BALLS = 10;
var INITIAL_RADIUS = 150;

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

function Ball(position, radius, color, velocity) {
    this.position = position;
    this.radius = radius;
    this.color = {
        fill: color,
        edge: shadeColor(color, -25)
    };
    this.velocity = velocity;
}

Ball.prototype.alive = function() {
    return this.radius > 0;
};

Ball.prototype.dead = function() {
    return !this.alive();
};

Ball.prototype.contains = function(ball) {
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
};

Ball.prototype.merge = function(ball) {
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
};

class MergeBallsServer extends ServerModuleInterface {
  willBeShownSoon(container, deadline) {
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

      function makeRandomColor() {
          var c = '';
          while (c.length < 6) {
              c += (Math.random()).toString(16).substr(-6).substr(-1);
          }
          return '#'+c;
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

      state.create('balls', [{
          position: {
            x: 'NumberLerpInterpolator',
            y: 'NumberLerpInterpolator'
          },
          radius: 'NumberLerpInterpolator',
          color: 'CurrentValueInterpolator',
          velocity: {
            x: 'NumberLerpInterpolator',
            y: 'NumberLerpInterpolator'
          }
    }]);
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

      state.get('balls').set(this.balls, time);
  }
}

class MergeBallsClient extends ClientModuleInterface {
  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
  }

  willBeShownSoon(container, deadline) {
    this.surface = new CanvasSurface(container, wallGeometry);
    this.canvas = this.surface.context;
  }

  draw(time, delta) {
    this.canvas.fillStyle = 'black';
    this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);

    if (!state.get('balls')) { return; }

    var balls = state.get('balls').get(time-100);

    if (!balls ) { return; }

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

register(MergeBallsServer, MergeBallsClient);
