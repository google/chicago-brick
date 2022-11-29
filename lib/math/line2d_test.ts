import chai from "https://cdn.skypack.dev/chai@4.3.4?dts";
import { describe, it } from "https://deno.land/std@0.166.0/testing/bdd.ts";
import {
  distanceToSegment,
  intersection,
  intersects,
  onSegment,
} from "./line2d.ts";

const expect = chai.expect;

describe("onSegment", () => {
  it("returns true when a point is on a segment", () => {
    const b = onSegment({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0.5 });
    expect(b).to.be.true;
  });
  it("returns false when a point is on a segment", () => {
    const b = onSegment({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0.1, y: 0.5 });
    expect(b).to.be.false;
  });
});

describe("intersection", () => {
  it("returns null when lines are parallel", () => {
    const r = intersection(
      { x: 5, y: 6 },
      { x: 6, y: 7 },
      { x: -3, y: 0 },
      {
        x: -4,
        y: -1,
      },
      0,
      0,
    );
    expect(r).to.be.null;
  });
  it("returns null when lines are the same", () => {
    const r = intersection(
      { x: 5, y: 6 },
      { x: 6, y: 7 },
      { x: 5, y: 6 },
      {
        x: 6,
        y: 7,
      },
      0,
      0,
    );
    expect(r).to.be.null;
  });
  it("returns null when lines intersect, but segments do not", () => {
    const r = intersection(
      { x: 5, y: 6 },
      { x: 6, y: 7 },
      { x: 6, y: 8 },
      {
        x: 7,
        y: 7,
      },
      0,
      0,
    );
    expect(r).to.be.null;
  });
  it("returns a valid intersection point when lines intersect", () => {
    const r = intersection(
      { x: 5, y: 6 },
      { x: 6, y: 7 },
      { x: 5, y: 7 },
      {
        x: 6,
        y: 6,
      },
      0,
      0,
    );
    expect(r).to.deep.equal({ p: { x: 5.5, y: 6.5 }, u: 0.5, v: 0.5 });
  });
});

describe("intersects", () => {
  it("returns false when lines are parallel", () => {
    const r = intersects({ x: 5, y: 6 }, { x: 6, y: 7 }, { x: -3, y: 0 }, {
      x: -4,
      y: -1,
    });
    expect(r).to.be.false;
  });
  it("returns false when lines are the same", () => {
    const r = intersects({ x: 5, y: 6 }, { x: 6, y: 7 }, { x: 5, y: 6 }, {
      x: 6,
      y: 7,
    });
    expect(r).to.be.false;
  });
  it("returns false when lines intersect, but segments do not", () => {
    const r = intersects({ x: 5, y: 6 }, { x: 6, y: 7 }, { x: 6, y: 8 }, {
      x: 7,
      y: 7,
    });
    expect(r).to.be.false;
  });
  it("returns true when lines intersect", () => {
    const r = intersects({ x: 5, y: 6 }, { x: 6, y: 7 }, { x: 5, y: 7 }, {
      x: 6,
      y: 6,
    });
    expect(r).to.be.true;
  });
});

describe("distanceToSegment", () => {
  it("returns 0 when point is on segment", () => {
    const d = distanceToSegment({ x: 3, y: 4 }, { x: 7, y: -5 }, {
      x: 7,
      y: -5,
    });
    expect(d).to.equal(0);
  });
  it("returns distance to point when segment is of 0 length", () => {
    const d = distanceToSegment({ x: 3, y: 4 }, { x: 3, y: 4 }, { x: 0, y: 0 });
    expect(d).to.equal(5);
  });
  it("returns distance to endpoint when out of skew", () => {
    const d = distanceToSegment({ x: -4, y: -1 }, { x: -4, y: 0 }, {
      x: -1,
      y: 4,
    });
    expect(d).to.equal(5);
  });
  it("returns distance correctly", () => {
    const d = distanceToSegment({ x: -4, y: -1 }, { x: -4, y: 0 }, {
      x: -1,
      y: -0.5,
    });
    expect(d).to.equal(3);
  });
});
