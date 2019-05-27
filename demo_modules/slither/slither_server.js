const register = require('register');
const ModuleInterface = require('lib/module_interface');
const debug = require('debug');
const state = require('state');
const wallGeometry = require('wallGeometry');

const COLORS = [
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ff00ff',
  '#cdc9c9',
  '#ffdead',
  '#bebebe',
  '#e6e6fa',
  '#8470ff',
  '#00bfff',
  '#40e0d0',
  '#2e8b57',
  '#32cd32',
  '#ffff00',
  '#ffd700',
  '#cd5c5c',
  '#b22222',
  '#f4a460',
  '#ffa500',
  '#ff6347',
  '#d02090',
  '#8a2be2',
]
const SPEED = 0.2;

const isOutOfBounds = ({x, y}, rect) => {
  return x < rect.x || y < rect.y || x > rect.x + rect.w || y > rect.y + rect.h;
};

class SlitherServer extends ModuleInterface.Server {
  constructor(config) {
    super();
    // Last position and heading and color of each snake.
    this.snakes = [];

    this.numSnakes = config.numSnakes || 10;
  }
  willBeShownSoon(deadline) {
    // Initialize the snakes.
    this.snakes = Array.from({length: this.numSnakes}).map(() => {
      return {
        startTime: deadline || 0,
        heading: Math.random() * 2 * Math.PI,
        position: {
          x: Math.random() * wallGeometry.extents.w,
          y: Math.random() * wallGeometry.extents.h,
        },
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      };
    });

    state.create('snakes', [{
      startTime: 'ValueNearestInterpolator',
      heading: 'NumberLerpInterpolator',
      position: {
        x: 'NumberLerpInterpolator',
        y: 'NumberLerpInterpolator'
      },
      color: 'ValueNearestInterpolator'
    }]);
    return Promise.resolve();
  }
  tick(time, delta) {
    if (!time) {
      return;
    }
    // Every tick, we need to choose between a few different strategies.
    // We don't want to change that often.
    // In the beginning our strategies will only be how far to turn whatever direction.
    // If we are OOB, we'll try to turn back towards the center.
    // Otherwise, we'll either turn a little or a lot to the left or right, or not all all.
    // We want to switch strategies about once every second or so.
    this.snakes.forEach((snake, index) => {
      // First check OOB:
      if (isOutOfBounds(snake.position, wallGeometry.extents)) {
        const wallCenter = {
          x: wallGeometry.extents.x + wallGeometry.extents.w / 2,
          y: wallGeometry.extents.y + wallGeometry.extents.h/2
        };
        const delta = {
          x: wallCenter.x - snake.position.x,
          y: wallCenter.y - snake.position.y
        };
        // Is heading to left or right of the angle of the delta?
        const deltaAngle = Math.atan2(delta.y, delta.x);
        const normalizedHeading = (snake.heading % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

        const angle = normalizedHeading - deltaAngle;
        // Try to turn back towards the center of the screen.
        if (-.1 < angle && angle < .1) {
          // nada
        } else if (-Math.PI <= angle && angle < 0 || Math.PI < angle && angle <= 2 * Math.PI) {
          // Turn left
          snake.heading += .03;
        } else if (-2 * Math.PI <= angle && angle < -Math.PI || 0 < angle && angle <= Math.PI) {
          // Turn right
          snake.heading -= .03;
        }
      } else {
        let t = Math.max(time - snake.startTime, 0);
        let strategySeed = Math.floor(t / 1000.0);
        strategySeed *= (index + 1) * 17;
        const strategies = [
          // Go straight:
          snake => {},
          // Turn left a bit.
          snake => snake.heading += .02,
          // Turn right a bit.
          snake => snake.heading -= .02,
          // Turn left.
          snake => snake.heading += .06,
          // Turn right.
          snake => snake.heading -= .06
        ];
        const strategyIndex = Math.floor(strategySeed) % strategies.length;
        strategies[strategyIndex](snake);
      }
      // Simulate snake.
      snake.position.x += Math.cos(snake.heading) * SPEED * delta;
      snake.position.y += Math.sin(snake.heading) * SPEED * delta;
    });
    state.get('snakes').set(this.snakes, time);
  }
}

register(SlitherServer, null);
