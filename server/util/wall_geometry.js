/* Copyright 2015 Google Inc. All Rights Reserved.

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
  // Splits the current wall geometry into some number of pieces (either 1, 2,
  // 3 or 4). First, we choose the number of cuts form 0-3. Then, for each cut,
  // we choose a polygon and split it along a dimension, provided that the
  // extents are at least 4 screens long. We return an array of polygons.
  partitionGeo: function(maxPartitions) {
    var numberOfCuts = Math.floor(Math.random() * maxPartitions);
    var geos = [geo];
    var displayWidth = xscale;
    var displayHeight = yscale;

    function chooseReasonableCutPoint(min, max) {
      var THRESHOLD = 0.3;
      var adjustedMin = Math.max(
          Math.floor(min * (1 - THRESHOLD) + THRESHOLD * max), min + 2);
      var adjustedMax = Math.min(
          Math.ceil(min * THRESHOLD + (1 - THRESHOLD) * max), max - 1);
      return Math.floor(Math.random() * (adjustedMax - adjustedMin)) + adjustedMin;
    }
    function getSuitableDimensions(poly) {
      var ret = [];
      if (poly.extents.w > 4 * displayWidth) {
        ret.push({poly: poly, dim: 'w'});
      }
      if (poly.extents.h > 4 * displayHeight) {
        ret.push({poly: poly, dim: 'h'});
      }
      return ret;
    }
    for (var i = 0; i < numberOfCuts; ++i) {
      // From the polygons, randomly choose a dimension that is big enough.
      var toCut = _.sample(_(geos.map(getSuitableDimensions)).flatten());

      if (!toCut) {
        // No dimensions! Print a debug-level warning, exit.
        debug('No dimensions to partition! Running with ' + geos.length + ' polys');
        break;
      }

      // Generate a cut line:
      var cutLine = {};
      if (toCut.dim == 'h') {
        cutLine.x1 = toCut.poly.extents.x;
        cutLine.x2 = toCut.poly.extents.x + toCut.poly.extents.w;
        var ymin = toCut.poly.extents.y / displayHeight;
        var ymax = (toCut.poly.extents.y + toCut.poly.extents.h) / displayHeight;
        var y = displayHeight * chooseReasonableCutPoint(ymin, ymax);
        cutLine.y1 = y;
        cutLine.y2 = y;
      } else {
        cutLine.y1 = toCut.poly.extents.y;
        cutLine.y2 = toCut.poly.extents.y + toCut.poly.extents.h;
        var xmin = toCut.poly.extents.x / displayWidth;
        var xmax = (toCut.poly.extents.x + toCut.poly.extents.w) / displayWidth;
        var x = displayWidth * chooseReasonableCutPoint(xmin, xmax);
        cutLine.x1 = x;
        cutLine.x2 = x;
      }

      var polys = geometry.cutPolygon(toCut.poly, cutLine.x1, cutLine.y1, cutLine.x2, cutLine.y2);

      var validPolys = [];
      if (polys.left.points.length >= 3) {
        validPolys.push(polys.left);
      }
      if (polys.right.points.length >= 3) {
        validPolys.push(polys.right);
      }
      // Now, replace toCut.poly in geos with my new polys.
      var indexToReplace = geos.indexOf(toCut.poly);
      validPolys.unshift(1);
      validPolys.unshift(indexToReplace);
      geos.splice.apply(geos, validPolys);
    }

    // Split polys
    return geos;
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

