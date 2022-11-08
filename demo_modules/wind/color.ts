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

// Most of this code borrowed or derived from the awesome weather visualization
// at https://earth.nullschool.net and its open source code:
// https://github.com/cambecc/earth.

const tau = 2 * Math.PI;

export type Color = [number, number, number] | [number, number, number, number];

function colorInterpolator(start: Color, end: Color) {
  const r = start[0], g = start[1], b = start[2];
  const Δr = end[0] - r, Δg = end[1] - g, Δb = end[2] - b;
  return function (i: number, a: number): Color {
    return [
      Math.floor(r + i * Δr),
      Math.floor(g + i * Δg),
      Math.floor(b + i * Δb),
      a,
    ];
  };
}

/**
 * Produces a color style in a rainbow-like trefoil color space. Not quite HSV, but produces a nice
 * spectrum. See http://krazydad.com/tutorials/makecolors.php.
 *
 * @param hue the hue rotation in the range [0, 1]
 * @param a the alpha value in the range [0, 255]
 * @returns {Array} [r, g, b, a]
 */
function sinebowColor(hue: number, a: number): Color {
  // Map hue [0, 1] to radians [0, 5/6τ]. Don't allow a full rotation because that keeps hue == 0 and
  // hue == 1 from mapping to the same color.
  let rad = hue * tau * 5 / 6;
  rad *= 0.75; // increase frequency to 2/3 cycle per rad

  const s = Math.sin(rad);
  const c = Math.cos(rad);
  const r = Math.floor(Math.max(0, -c) * 255);
  const g = Math.floor(Math.max(s, 0) * 255);
  const b = Math.floor(Math.max(c, 0, -s) * 255);
  return [r, g, b, a];
}

const BOUNDARY = 0.45;
const fadeToWhite = colorInterpolator(sinebowColor(1.0, 0), [255, 255, 255]);

/**
 * Interpolates a sinebow color where 0 <= i <= j, then fades to white where j < i <= 1.
 *
 * @param i number in the range [0, 1]
 * @param a alpha value in range [0, 255]
 * @returns {Array} [r, g, b, a]
 */
export function extendedSinebowColor(i: number, a: number): Color {
  return i <= BOUNDARY
    ? sinebowColor(i / BOUNDARY, a)
    : fadeToWhite((i - BOUNDARY) / (1 - BOUNDARY), a);
}

function asColorStyle(r: number, g: number, b: number, a: number): string {
  return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
}

export interface ColorScale extends Array<string> {
  indexFor(speed: number): number;
}

/**
 * @returns {Array} of wind colors and a method, indexFor, that maps wind magnitude to an index on the color scale.
 */
export function windIntensityColorScale(
  step: number,
  maxWind: number,
  minRgb: number,
): ColorScale {
  const result = [] as unknown as ColorScale;
  for (let j = minRgb; j <= 255; j += step) {
    result.push(asColorStyle(j, j, j, 1.0));
  }
  result.indexFor = function (m) { // map wind speed to a style
    return Math.floor(Math.min(m, maxWind) / maxWind * (result.length - 1));
  };
  return result;
}
