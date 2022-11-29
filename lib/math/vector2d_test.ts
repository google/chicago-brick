import chai from "https://cdn.skypack.dev/chai@4.3.4?dts";
import { describe, it } from "https://deno.land/std@0.166.0/testing/bdd.ts";
import {
  add,
  crossMag,
  dist,
  dist2,
  dot,
  len,
  len2,
  lerp,
  rot,
  scale,
  side,
  sub,
} from "./vector2d.ts";

const expect = chai.expect;

describe("dot", () => {
  it("returns the right answer", () => {
    const r = dot({ x: 5, y: 4 }, { x: 3, y: 2 });
    expect(r).to.equal(23);
  });
});

describe("len", () => {
  it("returns the right answer", () => {
    const r = len({ x: 4, y: 3 });
    expect(r).to.equal(5);
  });
});

describe("len2", () => {
  it("returns the right answer", () => {
    const r = len2({ x: 1, y: -4 });
    expect(r).to.equal(17);
  });
});

describe("dist", () => {
  it("returns the right answer", () => {
    const r = dist({ x: 5, y: -8 }, { x: 2, y: -4 });
    expect(r).to.equal(5);
  });
});

describe("dist2", () => {
  it("returns the right answer", () => {
    const r = dist2({ x: 2, y: 1 }, { x: -1, y: 0 });
    expect(r).to.equal(10);
  });
});

describe("sub", () => {
  it("returns the right answer", () => {
    const r = sub({ x: 2, y: 1 }, { x: -1, y: 0 });
    expect(r).to.deep.equal({ x: 3, y: 1 });
  });
});

describe("crossMag", () => {
  it("returns the right answer", () => {
    const r = crossMag({ x: 2, y: -3 }, { x: 5, y: 1 });
    expect(r).to.equal(17);
  });
});

describe("side", () => {
  it("returns 0 for on-the-line cases", () => {
    const s = side({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0.5 });
    expect(s).to.equal(0);
  });
  it("returns 0 for on-the-point cases", () => {
    const s = side({ x: 5, y: -7 }, { x: 10, y: 1 }, { x: 10, y: 1 });
    expect(s).to.equal(0);
  });
  it("returns < 1 for to-the-right-of cases", () => {
    const s = side({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0.5 });
    expect(s).to.be.lessThan(0);
  });
  it("returns > 1 for to-the-left-of cases", () => {
    const s = side({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0.5 });
    expect(s).to.be.greaterThan(0);
  });
});

describe("lerp", () => {
  it("returns the right answer", () => {
    const p = lerp({ x: 3, y: -2 }, { x: 5, y: 0 }, 0.5);
    expect(p).to.deep.equal({ x: 4, y: -1 });
  });
});

describe("add", () => {
  it("returns the right answer", () => {
    const p = add({ x: 7, y: 4 }, { x: -3, y: 0 });
    expect(p).to.deep.equal({ x: 4, y: 4 });
  });
});

describe("scale", () => {
  it("returns the right answer", () => {
    const p = scale({ x: 7, y: 4 }, 2);
    expect(p).to.deep.equal({ x: 14, y: 8 });
  });
});

describe("rot", () => {
  it("returns the same vec when angle is 0", () => {
    const p = rot({ x: 1, y: 0 }, 0);
    expect(p).to.deep.equal({ x: 1, y: 0 });
  });
  it("returns a rotated vec when angle is 90°", () => {
    const p = rot({ x: 1, y: 0 }, Math.PI / 2);
    expect(p.x).to.be.closeTo(0, 6);
    expect(p.y).to.be.closeTo(1, 6);
  });
});
