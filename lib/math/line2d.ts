import {
  crossMag,
  dist,
  dist2,
  dot,
  lerp,
  Point,
  side,
  sub,
} from "./vector2d.ts";

export interface Segment {
  a: Point;
  b: Point;
}

export function onSegment(p: Point, q: Point, x: Point) {
  return x.x >= Math.min(p.x, q.x) &&
    x.x <= Math.max(p.x, q.x) &&
    x.y >= Math.min(p.y, q.y) &&
    x.y <= Math.max(p.y, q.y) &&
    Math.abs(side(p, q, x)) < 0.0001;
}

export interface IntersectionReport {
  /** A number in [0, 1] that is the parameter of the line segment ab. */
  u: number;
  /** A number in [0, 1] that is the parameter of the line segment cd. */
  v: number;
  /** The intersection point. */
  p: Point;
}

// Damn it! Here I am, solving line segment intersection AGAIN.
// You think I would have learned my lesson by now. :(
//
// Given line segment ab and line segment cd, determine if there is an
// intersection point:
//   First, write ab and cd as parametric equations with variables u and v
//     in [0,1]:
//     l(ab) = a + (b - a)*u
//     l(cd) = c + (d - c)*v
//   We are looking for a point where l(ab) == l(cd) or:
//     a + (b - a)*u = c + (d - c)*v
//   While this may look line 1 equation with two free variables, because
//   a,b,c,d are vectors in 2d, this is actually TWO equations:
//     ax + (bx - ax)*u = cx + (dx - cx)*v
//     ay + (by - ay)*u = cy + (dy - cy)*v
//   Solve for v (arbitrary choice) in both:
//     ((ax - cx) + u*(bx - ax))/(dx - cx) = v
//     ((ay - cy) + u*(by - ay))/(dy - cy) = v
//   Set them equal, solve for u:
//     ((ax - cx) + u*(bx - ax))/(dx - cx) = ((ay - cy) + u*(by - ay))/(dy - cy)
//     (dy - cy) * ((ax - cx) + u*(bx - ax)) = (dx - cx) * ((ay - cy) + u*(by - ay))
//     (dy - cy)*(ax - cx) + u*(dy - cy)*(bx - ax) = (dx - cx)*(ay - cy) + u*(dx - cx)*(by - ay)
//     u*(dy - cy)*(bx - ax) - u*(dx - cx)*(by - ay) = (dx - cx)*(ay - cy) - (dy - cy)*(ax - cx)
//     u*((dy - cy)*(bx - ax) - (dx - cx)*(by - ay)) = (dx - cx)*(ay - cy) - (dy - cy)*(ax - cx)
//     u = ((dx - cx)*(ay - cy) - (dy - cy)*(ax - cx))/((dy - cy)*(bx - ax) - (dx - cx)*(by - ay))
//   If the denominator is 0 (or < epsilon), the lines are parallel.
//   If u < 0 or u > 1, the lines intersect, but not on the segment.
//   Solve for v in the same way (most stable, slower) or given u (faster):
//     ((ax - cx) + u*(bx - ax))/(dx - cx) = v
//   If v < 0 or v > 1, the lines intersect, but not on the segment.
//   Intersection is a + (b - a)*u in both dimensions.
export function intersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
  UEPSILON: number,
  VEPSILON: number,
): IntersectionReport | null {
  const det = crossMag(sub(b, a), sub(d, c));
  // Nearly 0:
  if (Math.abs(det) < 0.00001) {
    // Lines are parallel.
    return null;
  }

  const u = crossMag(sub(d, c), sub(a, c)) / det;
  if (u < UEPSILON || u > 1 - UEPSILON) {
    // Lines intersect; segments don't.
    return null;
  }

  // Fast way to solve for v, doesn't handle if CD segment is vertical
  //var v = ((ax - cx) + u*(bx - ax))/(dx - cx);
  // Slow way by solving equations above for u, setting equal, then resolving for v.
  const v = crossMag(sub(c, a), sub(b, a)) / det;
  if (v < VEPSILON || v > 1 - VEPSILON) {
    // Lines intersect; segments don't.
    return null;
  }

  // Send additional data for those curious.
  return { u, v, p: lerp(a, b, u) };
}

/** Returns true if the line segments ab and cd intersect. */
export function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  return !!intersection(a, b, c, d, 0, 0);
}

/** Returns the distance to the segment xy from the point p. */
export function distanceToSegment(x: Point, y: Point, p: Point): number {
  const d2 = dist2(x, y);
  if (d2 == 0) {
    // Return the distance to either point.
    return dist(x, p);
  }

  // Find the magnitude of the projection of p onto x<->y, then, divide by
  // the magnitude of d to get the scale factor for x<->y to produce the
  // intersection point.
  const t = dot(sub(p, x), sub(y, x)) / d2;
  if (t <= 0) {
    return dist(x, p);
  } else if (t >= 1) {
    return dist(y, p);
  }

  return dist(p, lerp(x, y, t));
}

export interface IntersectionSegmentReport extends IntersectionReport {
  segment: Segment;
}

export function collectIntersections(
  p1: Point,
  p2: Point,
  segments: Segment[],
  UEPSILON: number,
  VEPSILON: number,
): IntersectionSegmentReport[] {
  const intersections: IntersectionSegmentReport[] = [];
  for (const segment of segments) {
    const report = intersection(
      p1,
      p2,
      segment.a,
      segment.b,
      UEPSILON,
      VEPSILON,
    );
    if (report) {
      intersections.push({ ...report, segment });
    }
  }
  return intersections;
}
