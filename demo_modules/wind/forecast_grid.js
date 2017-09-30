/* Copyright 2017 Google Inc. All Rights Reserved.

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

const interpolateLib = require('lib/interpolate');

const util = require('./util');
const floorMod = util.floorMod;
const isValue = util.isValue;


class Forecast {
  constructor(gfsJson) {
    this.uData = gfsJson[0].data;
    this.vData = gfsJson[1].data;
    this.header = gfsJson[0].header;
  }

  get(i) {
    return [this.uData[i], this.vData[i]];
  }
}

class ForecastGrid {
  constructor(forecastJson) {
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
    var p = 0;
    var isContinuous = Math.floor(this.ni * this.Δλ) >= 360;
    for (var j = 0; j < this.nj; j++) {
      var row = [];
      for (var i = 0; i < this.ni; i++, p++) {
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

  interpolate(λ, φ) {
    // calculate longitude index in wrapped range [0, 360)
    var i = floorMod(λ - this.λ0, 360) / this.Δλ;

    // calculate latitude index in direction +90 to -90
    var j = (this.φ0 - φ) / this.Δφ;

    //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
    //        fi  i   ci          four points "G" that enclose point (i, j). These points are at the four
    //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
    //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
    //    j ___|_ .   |           (1, 9) and (2, 9).
    //  =8.3   |      |
    //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
    //         |      |           column, so the index ci can be used without taking a modulo.

    var fi = Math.floor(i), ci = fi + 1;
    var fj = Math.floor(j), cj = fj + 1;

    var row;
    if ((row = this.grid[fj])) {
      var g00 = row[fi];
      var g10 = row[ci];
      if (isValue(g00) && isValue(g10) && (row = this.grid[cj])) {
        var g01 = row[fi];
        var g11 = row[ci];
        if (isValue(g01) && isValue(g11)) {
          // All four points found, so interpolate the value.
          return interpolateLib.bilinearInterpolateVector(
              i - fi, j - fj, g00, g10, g01, g11);
        }
      }
    }
    debug("cannot interpolate: " + λ + "," + φ + ": " + fi + " " + ci +
        " " + fj + " " + cj);
    return null;
  }

  forEachPoint(cb) {
    for (var j = 0; j < this.nj; j++) {
      var row = this.grid[j] || [];
      for (var i = 0; i < ni; i++) {
        cb(floorMod(180 + this.λ0 + i * this.Δλ, 360) - 180,
            this.φ0 - j *this.Δφ, row[i]);
      }
    }
  }
}

module.exports = ForecastGrid;
