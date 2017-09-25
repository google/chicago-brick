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

if (typeof define !== 'function') {
  var define = require('amdefine')(module);
}

define(function(require) {
  // Bilinear interpolation of a scalar value.
  // https://en.wikipedia.org/wiki/Bilinear_interpolation
  function bilinearInterpolateScalar(x, y, g00, g10, g01, g11) {
    var rx = (1 - x);
    var ry = (1 - y);
    return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
  }

  // Bilinear interpolation of a scalar value.
  // https://en.wikipedia.org/wiki/Bilinear_interpolation
  function bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
    var rx = (1 - x);
    var ry = (1 - y);
    var a = rx * ry,  b = x * ry,  c = rx * y,  d = x * y;
    var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
    var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
    return [u, v, Math.sqrt(u * u + v * v)];
  }

  return {
    bilinearInterpolateScalar: bilinearInterpolateScalar,
    bilinearInterpolateVector: bilinearInterpolateVector,
  };
});
