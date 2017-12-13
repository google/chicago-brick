/* Copyright 2018 Google Inc. All Rights Reserved.

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

'use strict';
var fs = require('fs');
var _ = require('underscore');
var debug = require('debug')('wall:wall_geometry');

var geometry = require('lib/geometry');

// Returns a polygon that entirely contains the wall geometry. NOTE: any point
// to the left of the polygon is outside of it, because we assume that points
// are addressed from the top-left pixel.
function parseGeometry(polygonPoints) {
  var points = polygonPoints.reduce(function(agg, point) {
    var last = _(agg).last();
    var next;
    if (point.right) {
      next = {x: last.x + point.right, y: last.y};
    } else if (point.down) {
      next = {x: last.x, y: last.y + point.down};
    } else if (point.left) {
      next = {x: last.x - point.left, y: last.y};
    } else if (point.up) {
      next = {x: last.x, y: last.y - point.up};
    }
    agg.push(next);
    return agg;
  }, [{x: 0, y: 0}]);

  var poly = new geometry.Polygon(points);

  // Check to ensure we are closed.
  var last = _(poly.points).last();
  var first = poly.points[0];
  if (last.x != first.x || last.y != first.y) {
    throw new Error('Polygon is not closed!');
  }

  return poly;
}

var loadGeometry = function(path) {
  // Convert from config description to actual polygon.
  var config = JSON.parse(fs.readFileSync(path));
  return config.polygon;
};

var xscale = 1920;
var yscale = 1080;
var unscaledGeo;
var geo;

module.exports = {
  getGeo: function() {
    return geo;
  },
  loadGeometry: loadGeometry,
  useGeo: function(polygon) {
    unscaledGeo = parseGeometry(polygon);
    geo = unscaledGeo.scale(xscale, yscale);
  },
  setScale: function(newXScale, newYScale) {
    xscale = newXScale;
    yscale = newYScale;
    geo = unscaledGeo.scale(xscale, yscale);
  },
};

