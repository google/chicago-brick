import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import {
  ModuleState,
  NumberLerpInterpolator,
  SharedState,
  ValueNearestInterpolator,
} from "../../client/network/state_manager.ts";

import { add, rotCCW, scale } from "../../lib/math/vector2d.ts";
import { Client } from "../../client/modules/module_interface.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { Snake } from "./snake.ts";

export function load(state: ModuleState, wallGeometry: Polygon) {
  // TODO(applmak): Use a real color object/library.
  const darken = (color: string, i: number) => {
    return `#${
      color.substring(1).match(/.{2}/g)!.map((c) =>
        Math.max(0, parseInt(c, 16) - 5 * i).toString(16).padStart(2, "0")
      ).join("")
    }`;
  };

  class SlitherClient extends Client {
    surface: CanvasSurface | undefined = undefined;
    canvas!: CanvasRenderingContext2D;
    snakeState!: SharedState;
    willBeShownSoon(container: HTMLElement) {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.canvas = this.surface.context;
      this.snakeState = state.define("snakes", [{
        startTime: ValueNearestInterpolator,
        heading: NumberLerpInterpolator,
        position: {
          x: NumberLerpInterpolator,
          y: NumberLerpInterpolator,
        },
        color: ValueNearestInterpolator,
      }]);
    }
    draw(time: number) {
      // Clear the screen.
      this.canvas.fillStyle = "black";
      this.canvas.fillRect(
        0,
        0,
        this.surface!.virtualRect.w,
        this.surface!.virtualRect.h,
      );

      const snakeSeries: Snake[][] = [];
      for (let i = 0; i < 120 * 20; i += 120) {
        const s = this.snakeState.get(time - i);
        if (s) {
          snakeSeries.unshift(s as Snake[]);
        }
      }

      if (!snakeSeries.length) {
        return;
      }

      // Transpose the snakes to be per-snake.
      const snakes = snakeSeries[0].map((_col, i) => {
        return snakeSeries.map((row) => row[i]);
      });

      // Push a transform.
      this.surface!.pushOffset();

      // Draw each snake. This is probably faster than drawing all of the layers
      // individually, because these layers take up roughly the whole screen, so
      // no paths can be trivially eliminated. However, each snake is bounded
      // into a small area of the screen, so each can be trivially clipped.
      const OUTLINE_WIDTH = 5;
      const SEGMENT_RADIUS = 50;
      for (const snake of snakes) {
        // Outline:
        this.canvas.fillStyle = "gray";
        this.canvas.beginPath();
        for (const segment of snake) {
          this.canvas.moveTo(segment.position.x, segment.position.y);
          this.canvas.ellipse(
            segment.position.x,
            segment.position.y,
            SEGMENT_RADIUS + OUTLINE_WIDTH,
            SEGMENT_RADIUS + OUTLINE_WIDTH,
            0,
            0,
            2 * Math.PI,
            false,
          );
        }
        this.canvas.fill();

        // Body:
        for (const [i, segment] of snake.entries()) {
          this.canvas.fillStyle = darken(segment.color, snake.length - 1 - i);
          this.canvas.beginPath();
          this.canvas.ellipse(
            segment.position.x,
            segment.position.y,
            SEGMENT_RADIUS,
            SEGMENT_RADIUS,
            0,
            0,
            2 * Math.PI,
            false,
          );
          this.canvas.fill();
        }

        // Eyes:
        const DISTANCE_FROM_HEAD_CENTER_TO_EYE = 25;
        const EYE_RADIUS = 10;
        const EYE_VEC = scale({ x: 1, y: 0 }, DISTANCE_FROM_HEAD_CENTER_TO_EYE);
        const headSegment = snake[snake.length - 1];
        const leftEyePos = add(
          headSegment.position,
          rotCCW(EYE_VEC, headSegment.heading + Math.PI / 4),
        );
        const rightEyePos = add(
          headSegment.position,
          rotCCW(EYE_VEC, headSegment.heading - Math.PI / 4),
        );
        this.canvas.fillStyle = "white";
        this.canvas.beginPath();
        this.canvas.ellipse(
          leftEyePos.x,
          leftEyePos.y,
          EYE_RADIUS,
          EYE_RADIUS,
          0,
          0,
          2 * Math.PI,
          false,
        );
        this.canvas.moveTo(rightEyePos.x, rightEyePos.y);
        this.canvas.ellipse(
          rightEyePos.x,
          rightEyePos.y,
          EYE_RADIUS,
          EYE_RADIUS,
          0,
          0,
          2 * Math.PI,
          false,
        );
        this.canvas.fill();

        // Pupils:
        const leftPupilPos = add(
          headSegment.position,
          rotCCW(EYE_VEC, headSegment.heading + Math.PI / 4),
        );
        const rightPupilPos = add(
          headSegment.position,
          rotCCW(EYE_VEC, headSegment.heading - Math.PI / 4),
        );

        const pupilHeadingAdjustment = snake.length > 1
          ? headSegment.heading - snake[snake.length - 2].heading
          : 0;
        const pupilHeading = headSegment.heading + 10 * pupilHeadingAdjustment;
        const PUPIL_DIR = { x: 3, y: 0 };
        const leftPupilWithHeading = add(
          leftPupilPos,
          rotCCW(PUPIL_DIR, pupilHeading),
        );
        const rightPupilWithHeading = add(
          rightPupilPos,
          rotCCW(PUPIL_DIR, pupilHeading),
        );

        this.canvas.fillStyle = "black";
        this.canvas.beginPath();
        this.canvas.ellipse(
          leftPupilWithHeading.x,
          leftPupilWithHeading.y,
          EYE_RADIUS / 2,
          EYE_RADIUS / 2,
          0,
          0,
          2 * Math.PI,
          false,
        );
        this.canvas.moveTo(rightPupilWithHeading.x, rightPupilWithHeading.y);
        this.canvas.ellipse(
          rightPupilWithHeading.x,
          rightPupilWithHeading.y,
          EYE_RADIUS / 2,
          EYE_RADIUS / 2,
          0,
          0,
          2 * Math.PI,
          false,
        );
        this.canvas.fill();
      }

      this.surface!.popOffset();
    }
  }

  return { client: SlitherClient };
}
