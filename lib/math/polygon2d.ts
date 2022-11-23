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

import {
  add,
  crossMag,
  dist,
  dot,
  Point,
  rot,
  scale,
  side,
  sub,
} from "./vector2d.ts";
import {
  distanceToSegment,
  intersection,
  IntersectionReport,
  onSegment,
} from "./line2d.ts";
import { Rectangle } from "./rectangle.ts";

// Tolerance for various calculations.
const EPSILON = 0.001;

export interface PolygonIntersectionReport extends IntersectionReport {
  /** The first point of the intersected line of the polygon. */
  a: Point;
  /** The second point of the intersected line of the polygon. */
  b: Point;
  /** The first point of the tested segment. */
  x: Point;
  /** The second point of the tested segment. */
  y: Point;
}

// A polygon!
export class Polygon {
  readonly points: Point[];
  readonly extents: Rectangle;
  constructor(points: Point[]) {
    if (
      points.length > 1 &&
      points[0].x == points[points.length - 1].x &&
      points[0].y == points[points.length - 1].y
    ) {
      // Drop a doubled last point.
      points.pop();
    }
    this.points = points;
    if (points.length) {
      this.extents = points.reduce<Rectangle>((agg, p) => {
        if (p.x < agg.x) {
          agg.w += agg.x - p.x;
          agg.x = p.x;
        }
        if (p.y < agg.y) {
          agg.h += agg.y - p.y;
          agg.y = p.y;
        }
        if (p.x > agg.x + agg.w) {
          agg.w = p.x - agg.x;
        }
        if (p.y > agg.y + agg.h) {
          agg.h = p.y - agg.y;
        }
        return agg;
      }, new Rectangle(points[0].x, points[0].y, 0, 0));
    } else {
      this.extents = Rectangle.centeredAt(0, 0, 0, 0);
    }
  }
  scale(xscale: number, yscale: number): Polygon {
    return new Polygon(this.points.map((pt) => ({
      x: pt.x * xscale,
      y: pt.y * yscale,
    })));
  }
  floor(): Polygon {
    return new Polygon(this.points.map((pt) => ({
      x: Math.floor(pt.x),
      y: Math.floor(pt.y),
    })));
  }
  translate(p: Point): Polygon {
    return new Polygon(this.points.map((pt) => add(pt, p)));
  }
  rotate(angle: number): Polygon {
    return new Polygon(this.points.map((pt) => rot(pt, angle)));
  }
  *pairs(): Iterable<[Point, Point]> {
    if (this.points.length < 2) {
      return;
    }
    for (let j = 0; j < this.points.length; j++) {
      yield [this.points[j], this.points[(j + 1) % this.points.length]];
    }
  }
  *triples(): Iterable<[Point, Point, Point]> {
    if (this.points.length < 3) {
      return;
    }
    for (let j = 0; j < this.points.length; j++) {
      yield [
        this.points[j],
        this.points[(j + 1) % this.points.length],
        this.points[(j + 2) % this.points.length],
      ];
    }
  }
  *angles(): Iterable<number> {
    // Step 1: calculate the lengths of every side.
    const lengths = new Map();
    for (const [a, b] of this.pairs()) {
      // Store length a<->b in spot a in the map.
      lengths.set(a, dist(a, b));
    }
    for (const [a, b, c] of this.triples()) {
      const abLength = lengths.get(a);
      const bcLength = lengths.get(b);
      if (abLength < EPSILON || bcLength < EPSILON) {
        // If the side is too little, then we can't really calculate an angle
        // effectively. So, just say that it's straight.
        yield Math.PI / 2;
      }

      // Measure angle ABC via the dot product formula:
      // a dot b = |a||b|cos Theta
      const cosTheta = dot(sub(a, b), sub(c, b)) / abLength / bcLength;
      yield Math.acos(cosTheta);
    }
  }
  signedArea(): number {
    // To calculate the area, we take the sum of the magnitude of the cross
    // product of adjacent points. Note that this might be negative if the
    // points wrap a certain way.
    return 0.5 * [...this.pairs()]
      .reduce((sum, [a, b]) => sum + crossMag(a, b), 0);
  }
  centroid(): Point {
    const ret = [...this.pairs()].reduce((sum, [a, b]) => {
      const m = crossMag(a, b);
      return add(sum, scale(add(a, b), m));
    }, { x: 0, y: 0 });
    return scale(ret, 1 / (6 * this.signedArea()));
  }
  isOn(p: Point): boolean {
    for (const [a, b] of this.pairs()) {
      if (onSegment(a, b, p)) {
        return true;
      }
    }
    return false;
  }
  isInside(p: Point): boolean {
    // NOTE(applmak): Left-of-side tests only work for SIMPLE polygons.
    // /me is ashamed.
    const TEST_POINT = { x: this.extents.x - 100, y: this.extents.y - 100 };

    // Step 1: Check our test line against each segment of the polygon.
    const intersectionResults = [...this.pairs()]
      .map(([a, b]) => intersection(a, b, p, TEST_POINT, 0, 0));

    // Step 2: Check the u values of our intersections, if any are ≈0, then we
    // hit a vertex, which means that we'll double-count our crossings.
    // This boundary is arbitrarily chosen; we should probably make this
    // more numerically stable. Also, if our r.v is quite small, we'll have a similar problem.
    const numberOfCrossings = intersectionResults
      .reduce(
        (agg, r) => agg + (r && r.u > 0.00001 && r.v > 0.00001 ? 1 : 0),
        0,
      );

    // Even crossings? Not inside. Odd crossings? Inside.
    return !!(numberOfCrossings % 2);
  }
  isInsidePolygon(other: Polygon): boolean {
    return !this.points.find((p) => !other.isInside(p));
  }
  isClockwise(): boolean {
    return this.signedArea() < 0;
  }
  isConvex(): boolean {
    let sign = 0;
    for (const [a, b, c] of this.triples()) {
      const xp = crossMag(sub(b, a), sub(c, b));
      if (Math.sign(xp) == 0) {
        continue;
      }
      if (sign == 0) {
        sign = Math.sign(xp);
      } else if (sign != Math.sign(xp)) {
        return false;
      }
    }
    return true;
  }
  intersectionWithSegment(
    x: Point,
    y: Point,
  ): PolygonIntersectionReport | null {
    for (const [a, b] of this.pairs()) {
      const isect = intersection(a, b, x, y, 0, 0);
      if (isect) {
        return { a, b, ...isect, x, y };
      }
    }
    return null;
  }
  intersectionWithPolygon(other: Polygon): PolygonIntersectionReport | null {
    for (const [a, b] of this.pairs()) {
      const i = other.intersectionWithSegment(a, b);
      if (i) {
        return i;
      }
    }
    return null;
  }
  // Cuts a polygon into two polygons, as defined by the line x<->y.
  // TODO(applmak): Does this work?
  cutPolygon(x: Point, y: Point): { left: Polygon; right: Polygon } {
    const leftPoints = [], rightPoints = [];
    for (const [z, a, b] of this.triples()) {
      const aSide = side(x, y, a);
      if (aSide == 0) {
        // It's ON the line.
        // If z-a is co-linear, we still need to add a to both sets of
        // points. If not, then we don't. We'll detect this by calculating
        // the side of z. If it's 0, then we need to add.
        const zSide = side(x, y, z);
        if (zSide == 0) {
          leftPoints.push({ ...a });
          rightPoints.push({ ...a });
        }
        continue;
      }

      const points = aSide > 0 ? leftPoints : rightPoints;

      // Add a to the current point list.
      points.push({ ...a });

      const bSide = side(x, y, b);
      // Is the next point on the same side?
      if (Math.sign(bSide) == Math.sign(aSide)) {
        // Great! Next iteration will do the work.
        continue;
      }

      // Ah, next point is on the OTHER side (or on the line).
      // Find the intersection point of the cutline and the current line.
      const point = intersection(x, y, a, b, 0, 0);
      // There HAS to be a point.
      if (!point) {
        throw new Error(`Whoa, no point! ${x}, ${y}, ${a}, ${b}`);
      }
      // Add the intersection point to both sets of points.
      leftPoints.push({ ...point.p });
      rightPoints.push({ ...point.p });
    }

    return { left: new Polygon(leftPoints), right: new Polygon(rightPoints) };
  }
  distanceFromPoint(p: Point): number {
    return [...this.pairs()].reduce<number>((min, [a, b]) => {
      return Math.min(min, distanceToSegment(a, b, p));
    }, Infinity);
  }
  *iterateLatticePoints(): Iterable<[number, number, number]> {
    const fixupIndex = (i: number) =>
      (i + this.points.length) % this.points.length;

    if (this.points.length <= 2) {
      // No one cares about these degenerate polygons.
      return;
    }

    // Pick the point that's at the minimum y and the point next to that one.
    let indexA = this.points.findIndex((p) => p.y == this.extents.y);
    let indexB = indexA;

    // It's possible that the next b is at the same y as b. If so, advance b.
    do {
      const a = this.points[indexA];
      const nextIndexA = fixupIndex(indexA - 1);
      const nextA = this.points[nextIndexA];
      if (Math.abs(nextA.y - a.y) < EPSILON) {
        indexA = nextIndexA;
      } else {
        break;
      }
    } while (indexB != indexA);
    // Same with b;
    do {
      const b = this.points[indexB];
      const nextIndexB = fixupIndex(indexB + 1);
      const nextB = this.points[nextIndexB];
      if (Math.abs(nextB.y - b.y) < EPSILON) {
        indexB = nextIndexB;
      } else {
        break;
      }
    } while (indexB != indexA);

    // Iterate over each row in the polygon, starting with one that's inside.
    for (
      let y = Math.ceil(this.extents.y);
      y < this.extents.y + this.extents.h;
      y++
    ) {
      // Find the edges of the polygon that start at a and b and extend downwards.
      const a = this.points[indexA];
      const b = this.points[indexB];

      const nextIndexA = fixupIndex(indexA - 1);
      const nextIndexB = fixupIndex(indexB + 1);
      const nextA = this.points[nextIndexA];
      const nextB = this.points[nextIndexB];

      // Sanity check:
      if (a.y > nextA.y) {
        throw new Error("huh?!?");
      }

      // solve line equation at y=y;
      // The eq for A is:
      // (y - a.y) = (nextA.y - a.y)/(nextA.x - a.x) * (x - a.x)
      // so
      // x = (y - a.y)*(nextA.x - a.x)/(nextA.y - a.y) + a.x;
      // If nextA.y - a.y < EPSILON, then we're done.
      // Otherwise, solve for x.
      // If nextB.y - b.y < EPSILON, then we're done.
      // Otherwise, solve for x.
      if (Math.abs(nextA.y - a.y) < EPSILON) {
        return;
      }
      if (Math.abs(nextB.y - b.y) < EPSILON) {
        return;
      }

      const leftX = (y - a.y) * (nextA.x - a.x) / (nextA.y - a.y) + a.x;
      const rightX = (y - b.y) * (nextB.x - b.x) / (nextB.y - b.y) + b.x;

      // Sample from leftX,y to rightX,y.
      if (leftX < rightX) {
        yield [y, Math.ceil(leftX), Math.ceil(rightX)];
      } else {
        yield [y, Math.ceil(rightX), Math.ceil(leftX)];
      }

      // Check to see if we should move indices.
      // If we've moved past the y of nextA, adjust the indices. Same for nextB.
      if (y + 1 > nextA.y) {
        indexA = nextIndexA;
      }
      if (y + 1 > nextB.y) {
        indexB = nextIndexB;
      }
    }
  }
}
