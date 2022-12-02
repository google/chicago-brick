export interface Point {
  x: number;
  y: number;
}

export function equal(p: Point, q: Point): boolean {
  return p.x === q.x && p.y === q.y;
}

export function copy(dst: Point, src: Point) {
  dst.x = src.x;
  dst.y = src.y;
}

export function dot(p: Point, q: Point): number {
  return p.x * q.x + p.y * q.y;
}

export function len(p: Point): number {
  return Math.sqrt(len2(p));
}

export function len2(p: Point): number {
  return dot(p, p);
}

export function norm(p: Point): Point {
  return scale(p, 1 / len(p));
}

export function dist(p: Point, q: Point): number {
  return len(sub(p, q));
}

export function dist2(p: Point, q: Point): number {
  return len2(sub(p, q));
}

export function sub(p: Point, q: Point): Point {
  return { x: p.x - q.x, y: p.y - q.y };
}

export function add(p: Point, q: Point): Point {
  return { x: p.x + q.x, y: p.y + q.y };
}

export function scale(p: Point, s: number): Point {
  return { x: p.x * s, y: p.y * s };
}

export function crossMag(p: Point, q: Point): number {
  // The magnitude of the cross product of two 2d vectors is easy to calculate:
  return p.x * q.y - q.x * p.y;
}

export function side(p: Point, q: Point, x: Point): number {
  return crossMag(sub(q, p), sub(x, p));
}

export function lerp(p: Point, q: Point, s: number): Point {
  return add(p, scale(sub(q, p), s));
}

export function project(v: Point, b: Point): Point {
  return scale(b, dot(v, b) / len2(b));
}

export function flip(v: Point, b: Point): Point {
  const vOnB = project(v, b);
  return sub(v, scale(sub(v, vOnB), 2));
}

// CW, of all things.
export function rot(v: Point, angle: number): Point {
  return rotCW(v, angle);
}

export function rotCW(v: Point, angle: number): Point {
  return rotCCW(v, -angle);
}

export function rotCCW(v: Point, angle: number): Point {
  return {
    x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
    y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
  };
}
