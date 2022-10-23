import { Point } from "../../lib/math/vector2d.ts";

export interface Snake {
  startTime: number;
  heading: number;
  position: Point;
  color: string;
}
