import { Polygon } from "../../lib/math/polygon2d.ts";
import { sub } from "../../lib/math/vector2d.ts";
import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Snake } from "./snake.ts";

export function load(state: ModuleState, wallGeometry: Polygon) {
  const COLORS = [
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#ff00ff",
    "#cdc9c9",
    "#ffdead",
    "#bebebe",
    "#e6e6fa",
    "#8470ff",
    "#00bfff",
    "#40e0d0",
    "#2e8b57",
    "#32cd32",
    "#ffff00",
    "#ffd700",
    "#cd5c5c",
    "#b22222",
    "#f4a460",
    "#ffa500",
    "#ff6347",
    "#d02090",
    "#8a2be2",
  ];
  const SPEED = 0.2;

  function chooseDefaultSnakeCount() {
    // We want about 1 snake every 1000 pixels in each direction.
    return Math.ceil(
      wallGeometry.extents.w * wallGeometry.extents.h / 1000 / 1000,
    );
  }

  interface SnakesConfig {
    numSnakes: number;
  }

  class SlitherServer extends Server {
    // Last position and heading and color of each snake.
    snakes: Snake[] = [];
    readonly numSnakes: number;
    constructor(config: SnakesConfig) {
      super();

      this.numSnakes = config.numSnakes || chooseDefaultSnakeCount();
    }
    willBeShownSoon(deadline: number) {
      // Initialize the snakes.
      this.snakes = Array.from({ length: this.numSnakes }).map(() => {
        return {
          startTime: deadline || 0,
          heading: Math.random() * 2 * Math.PI,
          position: {
            x: Math.random() * wallGeometry.extents.w,
            y: Math.random() * wallGeometry.extents.h,
          },
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        };
      });
    }
    tick(time: number, delta: number) {
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
        if (!wallGeometry.extents.isInside(snake.position)) {
          const wallCenter = wallGeometry.extents.center();
          const delta = sub(wallCenter, snake.position);
          // Is heading to left or right of the angle of the delta?
          const deltaAngle = Math.atan2(delta.y, delta.x);
          const normalizedHeading =
            (snake.heading % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

          const angle = normalizedHeading - deltaAngle;
          // Try to turn back towards the center of the screen.
          if (-.1 < angle && angle < .1) {
            // nada
          } else if (
            -Math.PI <= angle && angle < 0 ||
            Math.PI < angle && angle <= 2 * Math.PI
          ) {
            // Turn left
            snake.heading += .03;
          } else if (
            -2 * Math.PI <= angle && angle < -Math.PI ||
            0 < angle && angle <= Math.PI
          ) {
            // Turn right
            snake.heading -= .03;
          }
        } else {
          const t = Math.max(time - snake.startTime, 0);
          let strategySeed = Math.floor(t / 1000.0);
          strategySeed *= (index + 1) * 17;
          const strategies = [
            // Go straight:
            () => {},
            // Turn left a bit.
            (snake: Snake) => snake.heading += .02,
            // Turn right a bit.
            (snake: Snake) => snake.heading -= .02,
            // Turn left.
            (snake: Snake) => snake.heading += .06,
            // Turn right.
            (snake: Snake) => snake.heading -= .06,
          ];
          const strategyIndex = Math.floor(strategySeed) % strategies.length;
          strategies[strategyIndex](snake);
        }
        // Simulate snake.
        snake.position.x += Math.cos(snake.heading) * SPEED * delta;
        snake.position.y += Math.sin(snake.heading) * SPEED * delta;
      });
      state.store("snakes", time, this.snakes);
    }
  }

  return { server: SlitherServer };
}
