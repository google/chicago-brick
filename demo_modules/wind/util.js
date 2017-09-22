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

/**
 * @returns {Boolean} true if the specified value is not null and not undefined.
 */
function isValue(x) {
  return x !== null && x !== undefined;
}

/**
 * @returns {Number} returns remainder of floored division, i.e., floor(a / n).
 *     Useful for consistent modulo of negative numbers.
 *     See http://en.wikipedia.org/wiki/Modulo_operation.
 */
function floorMod(a, n) {
  var f = a - n * Math.floor(a / n);
  // HACK: when a is extremely close to an n transition, f can be equal to n.
  // This is bad because f must be within range [0, n). Check for this corner
  // case. Example: a:=-1e-16, n:=10. What is the proper fix?
  return f === n ? 0 : f;
}


exports.floorMod = floorMod;
exports.isValue = isValue;
