import { Polygon } from "../../lib/math/polygon2d.ts";
import { Point } from "../../lib/math/vector2d.ts";

export interface Color {
  counted: number;
  r: number;
  g: number;
  b: number;
}

export interface TiffanyPoint extends Point {
  newPt?: boolean;
  key?: boolean;
}

export class TiffanyPolygon extends Polygon {
  attrs: {
    addedAt: number;
    completeAt: number;
    replacedAt: number | null;
    deleteAt: number | null;
    imageIndex: number;
    parentColor: Color | null;
    color: Color | null;
    stddev: {
      n: number;
      stddev: number;
      weight: number;
    } | null;
  };
  constructor(readonly points: TiffanyPoint[]) {
    super(points);
    this.attrs = {
      addedAt: 0,
      completeAt: 0,
      replacedAt: null,
      deleteAt: null,
      imageIndex: 0,
      parentColor: null,
      color: null,
      stddev: null,
    };
  }
}

declare global {
  interface EmittedEvents {
    polygons(data: { polygons: TiffanyPolygon[] }): void;
  }
}
