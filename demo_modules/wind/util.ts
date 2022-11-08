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

import { Point } from "../../lib/math/vector2d.ts";

// Most of this code borrowed or derived from the awesome weather visualization
// at https://earth.nullschool.net and its open source code:
// https://github.com/cambecc/earth.

/**
 * @returns {Boolean} true if the specified value is not null and not undefined.
 */
export function isValue<T>(x: T | null | undefined): x is T {
  return x !== null && x !== undefined;
}

/**
 * @returns {Number} returns remainder of floored division, i.e., floor(a / n).
 *     Useful for consistent modulo of negative numbers.
 *     See http://en.wikipedia.org/wiki/Modulo_operation.
 */
export function floorMod(a: number, n: number) {
  const f = a - n * Math.floor(a / n);
  // HACK: when a is extremely close to an n transition, f can be equal to n.
  // This is bad because f must be within range [0, n). Check for this corner
  // case. Example: a:=-1e-16, n:=10. What is the proper fix?
  return f === n ? 0 : f;
}

export function bilinearInterpolateVector(
  x: number,
  y: number,
  g00: [number, number],
  g10: [number, number],
  g01: [number, number],
  g11: [number, number],
): [number, number, number] {
  const rx = (1 - x);
  const ry = (1 - y);
  const a = rx * ry, b = x * ry, c = rx * y, d = x * y;
  const u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
  const v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
  return [u, v, Math.sqrt(u * u + v * v)];
}

export interface Bounds {
  x: number;
  y: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
}

export interface Particle extends Point {
  age: number;
  xt?: number;
  yt?: number;
  m?: number;
}
