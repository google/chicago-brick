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

import { easyLog } from "../../lib/log.ts";
import { bilinearInterpolateVector, floorMod, isValue } from "./util.ts";

const debug = easyLog("wind:forecast");

// Most of this code borrowed or derived from the awesome weather visualization
// at https://earth.nullschool.net and its open source code:
// https://github.com/cambecc/earth.

interface ForecastHeader {
  forecastTime: number;
  refTime: string;
  ny: number;
  nx: number;
  dy: number;
  dx: number;
  la1: number;
  lo1: number;
}

export interface ForecastJson {
  data: number[];
  header: ForecastHeader;
}

class Forecast {
  uData: number[];
  vData: number[];
  header: ForecastHeader;
  constructor(gfsJson: ForecastJson[]) {
    this.uData = gfsJson[0].data;
    this.vData = gfsJson[1].data;
    this.header = gfsJson[0].header;
  }

  get(i: number): [number, number] {
    return [this.uData[i], this.vData[i]];
  }
}

export class ForecastGrid {
  λ0: number;
  φ0: number;
  Δλ: number;
  Δφ: number;
  ni: number;
  nj: number;
  grid: [number, number][][];
  date: Date;
  constructor(forecastJson: ForecastJson[]) {
    const forecast = new Forecast(forecastJson);
    const header = forecast.header;

    // the grid's origin (e.g., 0.0E, 90.0N)
    this.λ0 = header.lo1;
    this.φ0 = header.la1;

    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
    this.Δλ = header.dx;
    this.Δφ = header.dy;

    // number of grid points W-E and N-S (e.g., 144 x 73)
    this.ni = header.nx;
    this.nj = header.ny;

    // Scan mode 0 assumed. Longitude increases from λ0, and latitude decreases from φ0.
    // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
    const grid = [];
    let p = 0;
    const isContinuous = Math.floor(this.ni * this.Δλ) >= 360;
    for (let j = 0; j < this.nj; j++) {
      const row = [];
      for (let i = 0; i < this.ni; i++, p++) {
        row[i] = forecast.get(p);
      }
      if (isContinuous) {
        // For wrapped grids, duplicate first column as last column to simplify interpolation logic
        row.push(row[0]);
      }
      grid[j] = row;
    }

    this.grid = grid;
    this.date = new Date(header.refTime);
    this.date.setHours(this.date.getHours() + header.forecastTime);
  }

  interpolate(λ: number, φ: number) {
    // calculate longitude index in wrapped range [0, 360)
    const i = floorMod(λ - this.λ0, 360) / this.Δλ;

    // calculate latitude index in direction +90 to -90
    const j = (this.φ0 - φ) / this.Δφ;

    //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
    //        fi  i   ci          four points "G" that enclose point (i, j). These points are at the four
    //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
    //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
    //    j ___|_ .   |           (1, 9) and (2, 9).
    //  =8.3   |      |
    //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
    //         |      |           column, so the index ci can be used without taking a modulo.

    const fi = Math.floor(i), ci = fi + 1;
    const fj = Math.floor(j), cj = fj + 1;

    let row;
    if ((row = this.grid[fj])) {
      const g00 = row[fi];
      const g10 = row[ci];
      if (isValue(g00) && isValue(g10) && (row = this.grid[cj])) {
        const g01 = row[fi];
        const g11 = row[ci];
        if (isValue(g01) && isValue(g11)) {
          // All four points found, so interpolate the value.
          return bilinearInterpolateVector(
            i - fi,
            j - fj,
            g00,
            g10,
            g01,
            g11,
          );
        }
      }
    }
    debug(
      "cannot interpolate: " + λ + "," + φ + ": " + fi + " " + ci +
        " " + fj + " " + cj,
    );
    return null;
  }
}
