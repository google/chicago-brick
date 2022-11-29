import chai from "https://cdn.skypack.dev/chai@4.3.4?dts";
import { describe, it } from "https://deno.land/std@0.166.0/testing/bdd.ts";
import { checkPolygonRect, checkRectSegment, collide } from "./collision.ts";
import { Polygon } from "./polygon2d.ts";
import { Rectangle } from "./rectangle.ts";

const expect = chai.expect;

const UNIT_RECT = new Rectangle(0, 0, 1, 1);

describe("checkRectSegment", () => {
  it("returns false for left-of-rect lines", () => {
    const segment = { a: { x: -1, y: -1 }, b: { x: -1, y: 2 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(false);
  });
  it("returns false for right-of-rect lines", () => {
    const segment = { a: { x: 2, y: -1 }, b: { x: 2, y: 2 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(false);
  });
  it("returns false for below-rect lines", () => {
    const segment = { a: { x: -1, y: -1 }, b: { x: 2, y: -1 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(false);
  });
  it("returns false for above-rect lines", () => {
    const segment = { a: { x: -1, y: 2 }, b: { x: 2, y: 2 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(false);
  });

  it("returns true for on-left-side lines", () => {
    const segment = { a: { x: 0, y: -1 }, b: { x: 0, y: 2 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(true);
  });
  it("returns true for on-right-side lines", () => {
    const segment = { a: { x: 1, y: -1 }, b: { x: 1, y: 2 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(true);
  });
  it("returns true for on-bottom-side lines", () => {
    const segment = { a: { x: -1, y: 0 }, b: { x: 2, y: 0 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(true);
  });
  it("returns true for on-top-side lines", () => {
    const segment = { a: { x: -1, y: 1 }, b: { x: 2, y: 1 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(true);
  });

  it("returns false for on-left-but-not-near-side lines", () => {
    const segment = { a: { x: 0, y: 2 }, b: { x: 0, y: 3 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(false);
  });
  it("returns false for on-right-but-not-near-side lines", () => {
    const segment = { a: { x: 1, y: -1 }, b: { x: 1, y: -2 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(false);
  });
  it("returns false for on-bottom-but-not-near-side lines", () => {
    const segment = { a: { x: -1, y: 0 }, b: { x: -2, y: 0 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(false);
  });
  it("returns false for on-top-but-not-near-side lines", () => {
    const segment = { a: { x: 2, y: 1 }, b: { x: 3, y: 1 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(false);
  });

  it("returns true for touching bl corner lines", () => {
    const segment = { a: { x: -1, y: 0 }, b: { x: 0, y: 0 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(true);
  });
  it("returns true for touching tl corner lines", () => {
    const segment = { a: { x: -1, y: 1 }, b: { x: 0, y: 1 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(true);
  });
  it("returns true for touching tr corner lines", () => {
    const segment = { a: { x: 2, y: 0 }, b: { x: 1, y: 1 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(true);
  });
  it("returns true for touching br corner lines", () => {
    const segment = { a: { x: 2, y: 1 }, b: { x: 1, y: 0 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(true);
  });

  it("returns true for line inside rect", () => {
    const segment = { a: { x: 0.2, y: 0.2 }, b: { x: 0.8, y: 0.7 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(true);
  });

  it("returns true for line that crosses rect", () => {
    const segment = { a: { x: -100, y: 100 }, b: { x: 100, y: -99 } };
    expect(checkRectSegment(UNIT_RECT, segment.a, segment.b)).to.equal(true);
  });
});

const FUNKY_POLYGON = new Polygon([
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 0, y: 0 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
]);

describe("checkPolygonRect", () => {
  it("return no hits for rect outside poly extents", () => {
    const testRect = UNIT_RECT.translate({ x: 10, y: 10 });
    const report = checkPolygonRect(FUNKY_POLYGON, testRect);
    expect(report.points).to.eql([]);
    expect(report.segments).to.eql([]);
  });
  it("returns 1 point and 2 segments when around one point", () => {
    const testRect = UNIT_RECT.translate({ x: -1.5, y: -1.5 });
    const report = checkPolygonRect(FUNKY_POLYGON, testRect);
    expect(report.points).to.eql([{ x: -1, y: -1 }]);
    expect(report.segments).to.eql([{
      a: { x: -1, y: -1 },
      b: { x: 0, y: -1 },
    }, {
      a: { x: -1, y: 1 },
      b: { x: -1, y: -1 },
    }]);
  });
  it("returns 4 points and five segments when just touching two points", () => {
    const report = checkPolygonRect(FUNKY_POLYGON, UNIT_RECT);
    expect(report.points).to.deep.equal([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(report.segments).to.deep.equal([{
      a: { x: 0, y: -1 },
      b: { x: 0, y: 0 },
    }, {
      a: { x: 0, y: 0 },
      b: { x: 0.5, y: 0.5 },
    }, {
      a: { x: 0.5, y: 0.5 },
      b: { x: 1, y: 0 },
    }, {
      a: { x: 1, y: 0 },
      b: { x: 1, y: 1 },
    }, {
      a: { x: 1, y: 1 },
      b: { x: -1, y: 1 },
    }]);
  });
  it("returns 2 points and four segments when not including the point", () => {
    const testRect = UNIT_RECT.translate({ x: 0, y: -0.75 });
    const report = checkPolygonRect(FUNKY_POLYGON, testRect);
    expect(report.points).to.deep.equal([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(report.segments).to.deep.equal([{
      a: { x: 0, y: -1 },
      b: { x: 0, y: 0 },
    }, {
      a: { x: 0, y: 0 },
      b: { x: 0.5, y: 0.5 },
    }, {
      a: { x: 0.5, y: 0.5 },
      b: { x: 1, y: 0 },
    }, {
      a: { x: 1, y: 0 },
      b: { x: 1, y: 1 },
    }]);
  });
});

describe("collide", () => {
  it("unit square with line", () => {
    const object = UNIT_RECT;
    const newObject = UNIT_RECT.translate({ x: 2, y: 0 });
    const wall = new Polygon([
      { x: -1, y: -1 },
      { x: 1.5, y: -1 },
      { x: 1.5, y: 10 },
      { x: -1, y: 5 },
    ]);

    const report = collide(object, newObject, wall);
    expect(report?.objectPoint).to.deep.equal({ x: 1.0, y: 0 });
    expect(report?.wallSegment).to.deep.equal({
      a: { x: 1.5, y: -1 },
      b: { x: 1.5, y: 10 },
    });
  });
  it("unit square with unit square", () => {
    const object = UNIT_RECT;
    const newObject = UNIT_RECT.translate({ x: 4, y: 0 });
    const wall = new Polygon([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]).translate({ x: 2, y: 0 });

    const report = collide(object, newObject, wall);
    expect(report?.u).to.equal(0.25);
    expect(report?.objectPoint).to.deep.equal({ x: 1.0, y: 0 });
    expect(report?.wallSegment).to.deep.equal({
      a: { x: 2, y: 1 },
      b: { x: 2, y: 0 },
    });
  });
  it("unit square with pointy bit", () => {
    const object = UNIT_RECT;
    const newObject = UNIT_RECT.translate({ x: 2, y: 0 });
    const wall = new Polygon([
      { x: 2, y: 0.5 },
      { x: 3, y: 2 },
      { x: -1, y: 2 },
      { x: -1, y: -2 },
      { x: 3, y: -2 },
    ]);
    const report = collide(object, newObject, wall);
    expect(report?.u).to.equal(0.5);
    expect(report?.wallPoint).to.deep.equal({ x: 2, y: 0.5 });
    expect(report?.objectSegment).to.deep.equal({
      a: { x: 1, y: 0 },
      b: { x: 1, y: 1 },
    });
  });
});
