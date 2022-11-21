// A collision algorithm.

import { collectIntersections, IntersectionReport, Segment } from "./line2d.ts";
import { Polygon } from "./polygon2d.ts";
import { Rectangle } from "./rectangle.ts";
import { add, equal, Point, side } from "./vector2d.ts";

export function checkRectSegment(
  rect: Rectangle,
  p1: Point,
  p2: Point,
): boolean {
  const rectPoints = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];

  let sum = 0;
  for (const rp of rectPoints) {
    sum += Math.sign(side(p1, p2, rp));
  }

  if (Math.abs(sum) === 4) {
    // All on one side...
    return false;
  }

  // Now check if the line segment misses the rectangle along some basis of projection (the x and y axes):
  if (p1.x < rect.x && p2.x < rect.x) {
    return false;
  }
  if (p1.x > rect.x + rect.w && p2.x > rect.x + rect.w) {
    return false;
  }
  if (p1.y < rect.y && p2.y < rect.y) {
    return false;
  }
  if (p1.y > rect.y + rect.h && p2.y > rect.y + rect.h) {
    return false;
  }

  return true;
}

export function checkPolygonRect(
  polygon: Polygon,
  rect: Rectangle,
): { points: Point[]; segments: Segment[] } {
  const ret = { points: [] as Point[], segments: [] as Segment[] };
  for (const [p1, p2] of polygon.pairs()) {
    // Test segment/rect collision.
    // If there is any, save the segment & then test the point.
    if (checkRectSegment(rect, p1, p2)) {
      // We can't use rect.isInside here, because we want to allow on-the-maximum-edge points.
      if (
        p1.x >= rect.x &&
        p1.x <= rect.x + rect.w &&
        p1.y >= rect.y &&
        p1.y <= rect.y + rect.h
      ) {
        ret.points.push(p1);
      }
      ret.segments.push({ a: p1, b: p2 });
    }
  }
  return ret;
}

export interface CollisionReport extends IntersectionReport {
  objectPoint?: Point;
  objectSegment?: Segment;
  wallPoint?: Point;
  wallSegment?: Segment;
}

/**
 * Check objects against walls.
 * objects is the position of the object when we started.
 * walls is the list of immobile polygons that we shouldn't move through.
 * We return the proportion of time used until the first collision.
 */
export function collide(
  object: Rectangle,
  newObject: Rectangle,
  wall: Polygon,
): CollisionReport | undefined {
  // For each object, generate a union of its before / after position.
  const extents = object.union(newObject);
  // Check this against the edges of the polygon -> set of vertices & segments of polygon that are interesting.
  const { points, segments } = checkPolygonRect(wall, extents);
  // Extrude rect point along time to get segment. Compare segment versus interesting polygon segments.
  const extrudedRectSegments: Segment[] = [{
    a: { x: object.x, y: object.y },
    b: { x: newObject.x, y: newObject.y },
  }, {
    a: { x: object.x + object.w, y: object.y },
    b: { x: newObject.x + newObject.w, y: newObject.y },
  }, {
    a: { x: object.x + object.w, y: object.y + object.h },
    b: { x: newObject.x + newObject.w, y: newObject.y + newObject.h },
  }, {
    a: { x: object.x, y: object.y + object.h },
    b: { x: newObject.x, y: newObject.y + newObject.h },
  }];

  const intersections: CollisionReport[] = [];
  for (const extrudedSegment of extrudedRectSegments) {
    intersections.push(
      ...collectIntersections(
        extrudedSegment.a,
        extrudedSegment.b,
        segments,
        0.0001,
        0,
      )
        .map((report) => {
          return {
            ...report,
            objectPoint: extrudedSegment.a,
            wallSegment: report.segment,
          };
        }),
    );
  }

  // Extrude polygon points along backwards time to get segment. Compare segment versus all rect segments.
  const posDelta = { x: object.x - newObject.x, y: object.y - newObject.y };
  const extrudedPolySegments = points.map((p) => {
    return { a: p, b: add(p, posDelta) };
  });

  const rectSegments: Segment[] = [{
    a: { x: object.x, y: object.y },
    b: { x: object.x + object.w, y: object.y },
  }, {
    a: { x: object.x + object.w, y: object.y },
    b: { x: object.x + object.w, y: object.y + object.h },
  }, {
    a: { x: object.x + object.w, y: object.y + object.h },
    b: { x: object.x, y: object.y + object.h },
  }, {
    a: { x: object.x, y: object.y + object.h },
    b: { x: object.x, y: object.y },
  }];

  for (const extrudedPolySegment of extrudedPolySegments) {
    intersections.push(
      ...collectIntersections(
        extrudedPolySegment.a,
        extrudedPolySegment.b,
        rectSegments,
        0.0001,
        0,
      ).map((report) => {
        return {
          ...report,
          wallPoint: extrudedPolySegment.a,
          objectSegment: report.segment,
        };
      }),
    );
  }

  // Find the smallest intersection time of all of these.
  if (intersections.length) {
    // console.log(intersections);
    const smallestIntersection = intersections.reduce((min, report) => {
      const reportU = report.u;
      const minU = min.u;
      if (reportU < minU) {
        return report;
      }
      if (reportU > minU) {
        return min;
      }

      // Well, these things have the same u. Which report is the best one?
      // Favor reports against walls, versus ones against points.
      if (report.wallSegment && !min.wallSegment) {
        return report;
      }
      if (!report.wallSegment && min.wallSegment) {
        return min;
      }

      if (report.wallSegment && min.wallSegment) {
        // Multiple wall segments, huh? That means we've hit multiple walls.
        // Which wall should win?
        // Favor where the collision point is not the same as the segment.
        if (
          (
            equal(report.p, report.wallSegment.a) ||
            equal(report.p, report.wallSegment.b)
          ) && !(equal(min.p, min.wallSegment.a) ||
            equal(min.p, min.wallSegment.b))
        ) {
          // Favor min.
          return min;
        } else if (
          !(
            equal(report.p, report.wallSegment.a) ||
            equal(report.p, report.wallSegment.b)
          ) && (equal(min.p, min.wallSegment.a) ||
            equal(min.p, min.wallSegment.b))
        ) {
          // Favor report
          return report;
        }
        // Uh, at this point, it doesn't really matter, I guess.
      }
      return min;
    }, intersections[0]);

    // TODO: support multiple intersections, like if we hit two walls at the same time.
    return smallestIntersection;
  }

  return undefined;
}

export function doPhysics<T extends Point>(
  obj: T,
  collisionRect: Rectangle,
  dt: number,
  polygon: Polygon,
  forward: (obj: T, dt: number, newPos: Point) => void,
  handleCollision: (obj: T, newPos: Point, report: CollisionReport) => void,
) {
  // We assume that the initial position of the object is correct.
  const newPosition: Point = { x: obj.x, y: obj.y };
  let tries = 10;
  for (; tries >= 0; --tries) {
    const collision = collisionRect.translate(obj);
    forward(obj, dt, newPosition);
    const newCollision = collisionRect.translate(newPosition);
    const report = collide(collision, newCollision, polygon);
    if (!report) {
      // Our new position is perfect!
      break;
    }

    // u is the factor of dt that we advanced until we collided.
    // Move that much time.
    forward(obj, dt * report.u, newPosition);

    // Flip v over the segment that we collided with.
    handleCollision(obj, newPosition, report);

    dt *= 1 - report.u;
  }

  if (tries === 0) {
    console.warn(
      `Tried really hard to collide against poly, but failed after 10 tries`,
    );
  }

  obj.x = newPosition.x;
  obj.y = newPosition.y;
}
