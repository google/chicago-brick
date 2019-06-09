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

import {dist, dot, sub, crossMag, add, scale, side} from './vector2d.js';
import {distanceToSegment, intersection, onSegment} from './line2d.js';
import {Rectangle} from './rectangle.js';

// Tolerance for various calculations.
const EPSILON = 0.001;

// A polygon!
export class Polygon {
  constructor(points) {
    if (points.length > 1 &&
        points[0].x == points[points.length-1].x &&
        points[0].y == points[points.length-1].y) {
      // Drop a doubled last point.
      points.pop();
    }
    this.points = points;
    this.extents = points.reduce((agg, p) => {
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
  }
  scale(xscale, yscale) {
    return new Polygon(this.points.map(pt => ({
      x: pt.x * xscale,
      y: pt.y * yscale,
    })));
  }
  floor() {
    return new Polygon(this.points.map(pt => ({
      x: Math.floor(pt.x),
      y: Math.floor(pt.y),
    })));
  }
  translate(p) {
    return new Polygon(this.points.map(pt => add(pt, p)));
  }
  *pairs() {
    if (this.points.length < 2) {
      return;
    }
    for (let j = 0; j < this.points.length; j++) {
      yield [this.points[j], this.points[(j+1) % this.points.length]];
    }
  }
  *triples() {
    if (this.points.length < 3) {
      return;
    }
    for (let j = 0; j < this.points.length; j++) {
      yield [this.points[j], this.points[(j+1) % this.points.length], this.points[(j+2) % this.points.length]];
    }
  }
  *angles() {
    // Step 1: calculate the lengths of every side.
    const lengths = new Map;
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
  signedArea() {
    // To calculate the area, we take the sum of the magnitude of the cross
    // product of adjacent points. Note that this might be negative if the
    // points wrap a certain way.
    return 0.5 * [...this.pairs()]
        .reduce((sum, [a, b]) => sum + crossMag(a,b), 0);
  }
  centroid() {
    const ret = [...this.pairs()].reduce((sum, [a, b]) => {
      const m = crossMag(a, b);
      return add(sum, scale(add(a, b), m));
    }, {x: 0, y: 0});
    return scale(ret, 1 / (6 * this.signedArea()));
  }
  isOn(p) {
    for (const [a, b] of this.pairs()) {
      if (onSegment(a, b, p)) {
        return true;
      }
    }
    return false;
  }
  isInside(p) {
    // NOTE(applmak): Left-of-side tests only work for SIMPLE polygons.
    // /me is ashamed.
    const TEST_POINT = {x: this.extents.x - 100, y: this.extents.y - 100};

    // Step 1: Check our test line against each segment of the polygon.
    const intersectionResults = [...this.pairs()]
        .map(([a, b]) => intersection(a, b, p, TEST_POINT));

    // Step 2: Check the u values of our intersections, if any are ≈0, then we
    // hit a vertex, which means that we'll double-count our crossings.
    const numberOfCrossings = intersectionResults
        .reduce((agg, r) => agg + (r && r.u > 0.0001 ? 1 : 0), 0);

    // Even crossings? Not inside. Odd crossings? Inside.
    return !!(numberOfCrossings % 2);
  }
  isInsidePolygon(other) {
    return !this.points.find(p => !other.isInside(p));
  }
  isClockwise() {
    return this.signedArea() < 0;
  }
  isConvex() {
    let sign = 0;
    for (const [a, b, c] of this.triples()) {
      const xp = crossMag(sub(b, a), sub(c, b));
      if (sign == 0) {
        sign = Math.sign(xp);
      } else if (sign != Math.sign(xp)) {
        return false;
      }
    }
    return true;
  }
  intersectionWithSegment(x, y) {
    for (const [a, b] of this.pairs()) {
      const isect = intersection(a, b, x, y);
      if (isect) {
        return {a, b, ...isect, x, y};
      }
    }
    return null;
  }
  intersectionWithPolygon(other) {
    for (const [a, b] of this.pairs()) {
      const i = other.intersectionWithSegment(a, b);
      if (i) {
        return i;
      }
    }
    return null;
  }
  // Cuts a polygon into two polygons, as defined by the line x<->y.
  cutPolygon(x, y) {
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
          leftPoints.push({...a});
          rightPoints.push({...a});
        }
        continue;
      }

      const points = aSide > 0 ? leftPoints : rightPoints;

      // Add a to the current point list.
      points.push({...a});

      const bSide = side(x, y, b);
      // Is the next point on the same side?
      if (Math.sign(bSide) == Math.sign(aSide)) {
        // Great! Next iteration will do the work.
        continue;
      }

      // Ah, next point is on the OTHER side (or on the line).
      // Find the intersection point of the cutline and the current line.
      const point = intersection(x, y, a, b);
      // There HAS to be a point.
      if (!point) {
        throw new Error(`Whoa, no point! ${x}, ${y}, ${a}, ${b}`);
      }
      // Add the intersection point to both sets of points.
      leftPoints.push({...point.p});
      rightPoints.push({...point.p});
    }

    return {left: new Polygon(leftPoints),
            right: new Polygon(rightPoints)};
  }
  distanceFromPoint(p) {
    return [...this.pairs()].reduce((min, [a, b]) => Math.min(min, distanceToSegment(a, b, p)));
  }
}
