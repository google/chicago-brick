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

import { Mask } from "./mask.ts";
import { Bounds, isValue, Particle } from "./util.ts";
import * as randomjs from "https://esm.sh/random-js@2.1.0";
import { ForecastGrid } from "./forecast_grid.ts";
import { Color, extendedSinebowColor } from "./color.ts";
import { easyLog } from "../../lib/log.ts";
import * as d3 from "https://deno.land/x/d3_4_deno@v6.2.0.9/src/mod.js";

const debug = easyLog("wind:vector_field");

const random = new randomjs.Random();
// Most of this code borrowed or derived from the awesome weather visualization
// at https://earth.nullschool.net and its open source code:
// https://github.com/cambecc/earth.

const τ = 2 * Math.PI;
const H = 0.0000360; // 0.0000360°φ ~= 4m
const NULL_VECTOR = [NaN, NaN, null]; // singleton for undefined location outside the vector field [u, v, mag]
const HOLE_VECTOR = [NaN, NaN, null]; // singleton that signifies a hole in the vector field
const TRANSPARENT_BLACK: Color = [0, 0, 0, 0]; // singleton 0 rgba
const OVERLAY_ALPHA = Math.floor(0.4 * 255); // overlay transparency (on scale [0, 255])
const VELOCITY_SCALE = 1 / 300000;

/**
 * Returns the distortion introduced by the specified projection at the given point.
 *
 * This method uses finite difference estimates to calculate warping by adding a very small amount (h) to
 * both the longitude and latitude to create two lines. These lines are then projected to pixel space, where
 * they become diagonals of triangles that represent how much the projection warps longitude and latitude at
 * that location.
 *
 * <pre>
 *        (λ, φ+h)                  (xλ, yλ)
 *           .                         .
 *           |               ==>        \
 *           |                           \   __. (xφ, yφ)
 *    (λ, φ) .____. (λ+h, φ)       (x, y) .--
 * </pre>
 *
 * See:
 *     Map Projections: A Working Manual, Snyder, John P: pubs.er.usgs.gov/publication/pp1395
 *     gis.stackexchange.com/questions/5068/how-to-create-an-accurate-tissot-indicatrix
 *     www.jasondavies.com/maps/tissot
 *
 * @returns {Array} array of scaled derivatives [dx/dλ, dy/dλ, dx/dφ, dy/dφ]
 */
function distortion(
  projection: d3.GeoProjection,
  λ: number,
  φ: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const hλ = λ < 0 ? H : -H;
  const hφ = φ < 0 ? H : -H;
  const pλ = projection([λ + hλ, φ])!;
  const pφ = projection([λ, φ + hφ])!;

  // Meridian scale factor (see Snyder, equation 4-3), where R = 1. This handles issue where length of 1° λ
  // changes depending on φ. Without this, there is a pinching effect at the poles.
  const k = Math.cos(φ / 360 * τ);

  return [
    (pλ[0] - x) / hλ / k,
    (pλ[1] - y) / hλ / k,
    (pφ[0] - x) / hφ,
    (pφ[1] - y) / hφ,
  ];
}

/**
 * Calculate distortion of the vector caused by the shape of the projection at point (x, y). The
 * vector is modified in place and returned by this function.
 */
function distort<T extends [number, number] | [number, number, number]>(
  projection: d3.GeoProjection,
  λ: number,
  φ: number,
  x: number,
  y: number,
  scale: number,
  vector: T,
): T {
  const u = vector[0] * scale;
  const v = vector[1] * scale;
  const d = distortion(projection, λ, φ, x, y);

  // Scale distortion vectors by u and v, then add.
  vector[0] = d[0] * u + d[2] * v;
  vector[1] = d[1] * u + d[3] * v;
  return vector;
}

export class VectorField {
  overlay: ImageData;
  constructor(
    public columns: [number, number, number][][],
    readonly bounds: Bounds,
    mask: Mask,
  ) {
    this.overlay = mask.imageData;
  }

  /**
   * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
   *          is undefined at that point.
   */
  vector(x: number, y: number): [number, number, number] | typeof NULL_VECTOR {
    const column = this.columns[Math.round(x)];
    return column && column[Math.round(y)] || NULL_VECTOR;
  }

  /**
   * @returns {boolean} true if the field is valid at the point (x, y)
   */
  isDefined(x?: number, y?: number) {
    return this.vector(x ?? 0, y ?? 0)[2] !== null;
  }

  /**
   * @returns {boolean} true if the point (x, y) lies inside the outer boundary of the vector field, even if
   *          the vector field has a hole (is undefined) at that point, such as at an island in a field of
   *          ocean currents.
   */
  isInsideBoundary(x: number, y: number) {
    return this.vector(x, y) !== NULL_VECTOR;
  }

  // Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
  // field is interpolated because the field closure's context is leaked, for reasons that defy explanation.
  // TODO(bmt): Make sure this is actually necessary (not my comment).
  release() {
    this.columns = [];
  }

  // TODO: Eliminate the loop.
  randomize(o: Particle) {
    let x, y;
    let safetyNet = 0;
    do {
      x = Math.round(random.real(this.bounds.x, this.bounds.xMax));
      y = Math.round(random.real(this.bounds.y, this.bounds.yMax));
    } while (!this.isDefined(x, y) && safetyNet++ < 30);
    o.x = x;
    o.y = y;
    return o;
  }

  static create(
    projection: d3.GeoProjection,
    mask: Mask,
    bounds: Bounds,
    forecastGrid: ForecastGrid,
  ) {
    // TODO(bmt): This probably belongs at a different level.
    // How fast particles move on the screen (arbitrary value chosen for aesthetics).
    const velocityScale = bounds.height * VELOCITY_SCALE;

    const columns: [number, number, number][][] = [];
    const point: [number, number] = [0, 0];

    function interpolateColumn(x: number) {
      const column = [];
      for (let y = bounds.y; y <= bounds.yMax; y += 2) {
        if (mask.isVisible(x, y)) {
          point[0] = x;
          point[1] = y;
          const coord = projection.invert!(point);
          let overlayColor = TRANSPARENT_BLACK;
          let vector = null;
          if (coord) {
            const λ = coord[0], φ = coord[1];
            if (isFinite(λ)) {
              vector = forecastGrid.interpolate(λ, φ);
              let scalar = null;
              if (vector) {
                vector = distort(
                  projection,
                  λ,
                  φ,
                  x,
                  y,
                  velocityScale,
                  vector,
                );
                scalar = vector[2];
              }

              // TODO(bmt): Overlay calculation should probably be separate from
              // the vector field construction.
              if (isValue(scalar)) {
                // TODO(bmt): Better color scheme for the wind speed.
                // TODO(bmt): Revisit wind speed range here.
                overlayColor = extendedSinebowColor(
                  Math.min(scalar, 75) / 75,
                  OVERLAY_ALPHA,
                );
              }
            }
          }
          column[y + 1] = column[y] = vector! || HOLE_VECTOR;
          mask.set(x, y, overlayColor)
            .set(x + 1, y, overlayColor)
            .set(x, y + 1, overlayColor)
            .set(x + 1, y + 1, overlayColor);
        }
      }
      columns[x + 1] = columns[x] = column;
    }

    let x = bounds.x;
    while (x < bounds.xMax) {
      interpolateColumn(x);
      x += 2;
    }

    for (let i = 0; i < columns.length; ++i) {
      if (!columns[i]) {
        columns[i] = [];
      }
    }

    debug(`Vector field cols:${columns.length} rows:${columns[0]?.length}`);
    return new VectorField(columns, bounds, mask);
  }
}
