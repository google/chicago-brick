import chai from "https://cdn.skypack.dev/chai@4.3.4?dts";
import { describe, it } from "https://deno.land/std@0.166.0/testing/bdd.ts";
import { Polygon } from "./polygon2d.ts";

const expect = chai.expect;
chai.config.truncateThreshold = 0;

const SQUARE_POINTS = [
  { x: 4, y: -1 },
  { x: 5, y: -1 },
  { x: 5, y: 0 },
  { x: 4, y: 0 },
];

describe("Polygon.extents", () => {
  it("has the right value on small polygons", () => {
    const p = new Polygon([{ x: 0, y: 0 }]);
    expect(p.extents).to.deep.equal({ x: 0, y: 0, w: 0, h: 0 });
  });
  it("has the right value on large polygons", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.extents).to.deep.equal({ x: 4, y: -1, w: 1, h: 1 });
  });
});

describe("Polygon.scale", () => {
  it("has the right value", () => {
    const p = new Polygon(SQUARE_POINTS);
    const sp = p.scale(2, 3);
    expect(sp.points).to.deep.equal([
      { x: 8, y: -3 },
      { x: 10, y: -3 },
      { x: 10, y: 0 },
      { x: 8, y: 0 },
    ]);
    expect(sp.extents).to.deep.equal({ x: 8, y: -3, w: 2, h: 3 });
    // Double-check that original poly hasn't changed.
    expect(p.extents).to.deep.equal({ x: 4, y: -1, w: 1, h: 1 });
  });
});

describe("Polygon.floor", () => {
  it("is a no-op on integer polygon", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.floor().points).to.deep.equal(p.points);
  });

  it("floors the coordinates", () => {
    const p = new Polygon([{ x: 1.5, y: 3.2 }, { x: 3.4, y: 4.1 }, {
      x: 2.7,
      y: 6.9,
    }]);
    const fp = p.floor();
    expect(fp.points).to.deep.equal([{ x: 1, y: 3 }, { x: 3, y: 4 }, {
      x: 2,
      y: 6,
    }]);
  });
});

describe("Polygon.translate", () => {
  it("has the right value", () => {
    const p = new Polygon(SQUARE_POINTS);
    const tp = p.translate({ x: -4, y: 1 });
    expect(tp.points).to.deep.equal([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
  });
});

describe("Polygon.pairs", () => {
  it("walks over all pairs", () => {
    const p = new Polygon(SQUARE_POINTS);
    const pairs = [...p.pairs()];
    expect(pairs).to.deep.equal([
      [{ x: 4, y: -1 }, { x: 5, y: -1 }],
      [{ x: 5, y: -1 }, { x: 5, y: 0 }],
      [{ x: 5, y: 0 }, { x: 4, y: 0 }],
      [{ x: 4, y: 0 }, { x: 4, y: -1 }],
    ]);
  });
});

describe("Polygon.triples", () => {
  it("walks over all triples", () => {
    const p = new Polygon(SQUARE_POINTS);
    const triples = [...p.triples()];
    expect(triples).to.deep.equal([
      [{ x: 4, y: -1 }, { x: 5, y: -1 }, { x: 5, y: 0 }],
      [{ x: 5, y: -1 }, { x: 5, y: 0 }, { x: 4, y: 0 }],
      [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 4, y: -1 }],
      [{ x: 4, y: 0 }, { x: 4, y: -1 }, { x: 5, y: -1 }],
    ]);
  });
});

describe("Polygon.angles", () => {
  it("returns all angles", () => {
    const p = new Polygon(SQUARE_POINTS);
    const angles = [...p.angles()];
    expect(angles).to.deep.equal([
      Math.PI / 2,
      Math.PI / 2,
      Math.PI / 2,
      Math.PI / 2,
    ]);
  });
});

describe("Polygon.signedArea", () => {
  it("returns the signed area", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.signedArea()).to.equal(1);
  });
});

describe("Polygon.centroid", () => {
  it("returns the centroid", () => {
    const p = new Polygon(SQUARE_POINTS);
    const c = p.centroid();
    expect(c).to.deep.equal({ x: 4.5, y: -0.5 });
  });
});

describe("Polygon.isOn", () => {
  it("returns true when a point is on the polygon", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.isOn({ x: 5, y: 0 })).to.be.true;
  });
  it("returns false when a point is not on the polygon", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.isOn({ x: 5, y: 0.1 })).to.be.false;
  });
});

describe("Polygon.isInside", () => {
  it("returns true when a point is inside the polygon", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.isInside({ x: 4.5, y: -0.1 })).to.be.true;
  });
  it("returns false when a point is outside the polygon", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.isInside({ x: 5.1, y: -0.1 })).to.be.false;
  });
  it("returns true when a point is on the polygon", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.isInside({ x: 5, y: -0.1 })).to.be.true;
  });
});

describe("Polygon.isClockwise", () => {
  it("returns false when a polygon is ccw", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.isClockwise()).to.be.false;
  });
  it("returns true when a polygon is cw", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.scale(-1, 1).isClockwise()).to.be.true;
  });
});

describe("Polygon.isConvex", () => {
  it("returns true when a polygon is convex", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.isConvex()).to.be.true;
  });
  it("returns true when a polygon is convex but wrapped the other way", () => {
    const p = new Polygon(SQUARE_POINTS);
    expect(p.scale(-1, 1).isConvex()).to.be.true;
  });
  it("returns false when a polygon is concave", () => {
    const CONCAVE_POINTS = [...SQUARE_POINTS];
    [CONCAVE_POINTS[2], CONCAVE_POINTS[3]] = [
      CONCAVE_POINTS[3],
      CONCAVE_POINTS[2],
    ];
    const p = new Polygon(CONCAVE_POINTS);
    expect(p.isConvex()).to.be.false;
  });
  it("returns true when three points are colinear", () => {
    const COLINEAR_POINTS = [
      { x: 1, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const p = new Polygon(COLINEAR_POINTS);
    expect(p.isConvex()).to.be.true;
  });
});

describe("Polygon.isInsidePolygon", () => {
  it("returns true when a polygon is totally inside", () => {
    const little = new Polygon(SQUARE_POINTS);
    const big = little.translate({ x: -4, y: 1 })
      .scale(3, 3)
      .translate({ x: 3, y: -2 });
    expect(little.isInsidePolygon(big)).to.be.true;
  });
  it("returns false when a polygon is not totally inside", () => {
    const little = new Polygon(SQUARE_POINTS);
    const other = little.translate({ x: 0.1, y: 0.1 });
    expect(little.isInsidePolygon(other)).to.be.false;
  });
  it("returns true in weird case", () => {
    const BALL_RADIUS = 50;
    const ORIGIN_BALL_POLYGON = new Polygon([
      { x: -BALL_RADIUS, y: -BALL_RADIUS },
      { x: BALL_RADIUS, y: -BALL_RADIUS },
      { x: BALL_RADIUS, y: BALL_RADIUS },
      { x: -BALL_RADIUS, y: BALL_RADIUS },
    ]);
    const little = ORIGIN_BALL_POLYGON.translate({
      x: 450.30415019999975,
      y: 349.69584980000025,
    });
    const big = new Polygon([
      { x: 0, y: 0 },
      { x: 1920, y: 0 },
      { x: 1920, y: 1080 },
      { x: 0, y: 1080 },
      { x: 0, y: 0 },
    ]);
    expect(little.isInsidePolygon(big)).to.be.true;
  });
});

describe("Polygon.intersectionWithSegment", () => {
  it("returns the intersection point", () => {
    const p = new Polygon(SQUARE_POINTS);
    const r = p.intersectionWithSegment({ x: 3.5, y: -0.5 }, {
      x: 4.5,
      y: -0.5,
    });
    expect(r).to.deep.equal({
      a: { x: 4, y: 0 },
      b: { x: 4, y: -1 },
      u: 0.5,
      v: 0.5,
      p: { x: 4, y: -0.5 },
      x: { x: 3.5, y: -0.5 },
      y: { x: 4.5, y: -0.5 },
    });
  });
});

describe("Polygon.iterateLatticePoints", () => {
  it("iterates over unit square correctly", () => {
    const p = new Polygon(SQUARE_POINTS).translate({ x: -4, y: 1 });
    const lattice = [...p.iterateLatticePoints()];
    expect(lattice).to.deep.equal([
      [0, 0, 1],
    ]);
  });
  it("iterates over square correctly", () => {
    const p = new Polygon(SQUARE_POINTS);
    const lattice = [...p.iterateLatticePoints()];
    expect(lattice).to.deep.equal([
      [-1, 4, 5],
    ]);
  });
  it("iterates over flipped square correctly", () => {
    const p = new Polygon(SQUARE_POINTS).scale(1, -1);
    const lattice = [...p.iterateLatticePoints()];
    expect(lattice).to.deep.equal([
      [-0, 4, 5],
    ]);
  });
  it("iterates over not-integer square correctly", () => {
    const p = new Polygon(SQUARE_POINTS).translate({ x: -4, y: 1 }).translate({
      x: 0.5,
      y: 0.5,
    });
    const lattice = [...p.iterateLatticePoints()];
    expect(lattice).to.deep.equal([
      [1, 1, 2],
    ]);
  });
  it("iterates over a triangle correctly", () => {
    const p = new Polygon([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 0 },
    ]);
    const lattice = [...p.iterateLatticePoints()];
    expect(lattice).to.deep.equal([
      [0, 0, 2],
      [1, 1, 2],
    ]);
  });
});

// TODO(applmak): Add tests for remaining poly methods.
