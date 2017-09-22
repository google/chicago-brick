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

const color = require('demo_modules/wind/color');
const util = require('demo_modules/wind/util');

const floorMod = util.floorMod;
const isValue = util.isValue;

const τ = 2 * Math.PI;
const H = 0.0000360;  // 0.0000360°φ ~= 4m
const NULL_VECTOR = [NaN, NaN, null];  // singleton for undefined location outside the vector field [u, v, mag]
const HOLE_VECTOR = [NaN, NaN, null];  // singleton that signifies a hole in the vector field
const TRANSPARENT_BLACK = [0, 0, 0, 0];  // singleton 0 rgba
const OVERLAY_ALPHA = Math.floor(0.4*255);  // overlay transparency (on scale [0, 255])

function ensureNumber(num, fallback) {
	return _.isFinite(num) || num === Infinity || num === -Infinity ? num : fallback;
}

/**
 * @param bounds the projection bounds: [[x0, y0], [x1, y1]]
 * @param width
 * @param height
 * @returns {Object} the projection bounds clamped to the specified view.
 */
function clampedBounds(bounds, width, height) {
	var upperLeft = bounds[0];
	var lowerRight = bounds[1];
	var x = Math.max(Math.floor(ensureNumber(upperLeft[0], 0)), 0);
	var y = Math.max(Math.floor(ensureNumber(upperLeft[1], 0)), 0);
	var xMax = Math.min(Math.ceil(ensureNumber(lowerRight[0], width)), width - 1);
	var yMax = Math.min(Math.ceil(ensureNumber(lowerRight[1], height)), height - 1);
	return {x: x, y: y, xMax: xMax, yMax: yMax, width: xMax - x + 1, height: yMax - y + 1};
}

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
function distortion(projection, λ, φ, x, y) {
	var hλ = λ < 0 ? H : -H;
	var hφ = φ < 0 ? H : -H;
	var pλ = projection([λ + hλ, φ]);
	var pφ = projection([λ, φ + hφ]);

	// Meridian scale factor (see Snyder, equation 4-3), where R = 1. This handles issue where length of 1° λ
	// changes depending on φ. Without this, there is a pinching effect at the poles.
	var k = Math.cos(φ / 360 * τ);

	return [
		(pλ[0] - x) / hλ / k,
		(pλ[1] - y) / hλ / k,
		(pφ[0] - x) / hφ,
		(pφ[1] - y) / hφ
	];
}

/**
 * Calculate distortion of the vector caused by the shape of the projection at point (x, y). The
 * vector is modified in place and returned by this function.
 */
function distort(projection, λ, φ, x, y, scale, vector) {
	var u = vector[0] * scale;
	var v = vector[1] * scale;
	var d = distortion(projection, λ, φ, x, y);

	// Scale distortion vectors by u and v, then add.
	vector[0] = d[0] * u + d[2] * v;
	vector[1] = d[1] * u + d[3] * v;
	return vector;
}

class Mask {
  constructor(projection) {
		// TODO(bmt): Get these from wall geometry.
		this.width = 1920;
		this.height = 1080;

		// Create a detached canvas, draw an opaque sphere that represents visible
		// points.
		var canvas = d3.select(document.createElement("canvas"))
			.attr("width", this.width).attr("height", this.height).node();
    const context = canvas.getContext('2d');

    const projectedPath = d3.geo.path().projection(projection).context(context);

		const mask = projectedPath({type: "Sphere"});
		context.fillStyle = "rgba(255, 0, 0, 1)";
		context.fill();

		// layout: [r, g, b, a, r, g, b, a, ...]
		this.imageData = context.getImageData(0, 0, this.width, this.height).data;
  }

	isVisible(x, y) {
		var i = (y * this.width + x) * 4;
		return this.imageData[i + 3] > 0;  // non-zero alpha means pixel is visible
	}

	set(x, y, rgba) {
		var i = (y * this.width + x) * 4;
		this.imageData[i] = rgba[0];
		this.imageData[i + 1] = rgba[1];
		this.imageData[i + 2] = rgba[2];
		this.imageData[i + 3] = rgba[3];
		return this;
	}
}

class VectorField {
  constructor(columns, bounds, mask) {
    this.columns = columns;
    this.bounds = bounds;
    this.overlay = new ImageData(mask.imageData, 1920, 1080);
  }

	/**
	 * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
	 *          is undefined at that point.
	 */
	vector(x, y) {
		var column = this.columns[Math.round(x)];
		return column && column[Math.round(y)] || NULL_VECTOR;
	}

	/**
	 * @returns {boolean} true if the field is valid at the point (x, y)
	 */
	isDefined(x, y) {
		return this.vector(x, y)[2] !== null;
	}

	/**
	 * @returns {boolean} true if the point (x, y) lies inside the outer boundary of the vector field, even if
	 *          the vector field has a hole (is undefined) at that point, such as at an island in a field of
	 *          ocean currents.
	 */
	isInsideBoundary(x, y) {
		return this.vector(x, y) !== NULL_VECTOR;
	}

	// Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
	// field is interpolated because the field closure's context is leaked, for reasons that defy explanation.
  // TODO(bmt): Make sure this is actually necessary (not my comment).
	release() {
    this.columns = [];
	}

	// TODO(bmt): Figure out what's happening here (not my comment).
	randomize(o) {  // UNDONE: this method is terrible
		var x, y;
		var safetyNet = 0;
		do {
			x = Math.round(_.random(this.bounds.x, this.bounds.xMax));
			y = Math.round(_.random(this.bounds.y, this.bounds.yMax));
		} while (!this.isDefined(x, y) && safetyNet++ < 30);
		o.x = x;
		o.y = y;
		return o;
	}

  static create(projection, forecastGrid) {
    const mask = new Mask(projection);
    const bounds = clampedBounds(
        d3.geo.path().projection(projection).bounds({type: "Sphere"}),
        1920, 1080);

    // TODO(bmt): This probably belongs at a different level.
    // How fast particles move on the screen (arbitrary value chosen for aesthetics).
    const velocityScale = bounds.height / 60000

    const columns = [];
    const point = [];

    function interpolateColumn(x) {
      const column = [];
      for (var y = bounds.y; y <= bounds.yMax; y += 2) {
        if (mask.isVisible(x, y)) {
          point[0] = x; point[1] = y;
          var coord = projection.invert(point);
          var overlayColor = TRANSPARENT_BLACK;
          var vector = null;
          if (coord) {
            var λ = coord[0], φ = coord[1];
            if (_.isFinite(λ)) {
              vector = forecastGrid.interpolate(λ, φ);
              var scalar = null;
              if (vector) {
                vector = distort(projection, λ, φ, x, y, velocityScale, vector);
                scalar = vector[2];
              }

              // TODO(bmt): Overlay calculation should probably be separate from
              // the vector field construction.
              if (isValue(scalar)) {
                // TODO(bmt): Better color scheme for the wind speed.
                // TODO(bmt): Revisit wind speed range here.
                overlayColor = color.extendedSinebowColor(
                    Math.min(scalar, 75) / 75, OVERLAY_ALPHA);
              }
            }
          }
          column[y+1] = column[y] = vector || HOLE_VECTOR;
          mask.set(x, y, overlayColor)
            .set(x+1, y, overlayColor)
            .set(x, y+1, overlayColor)
            .set(x+1, y+1, overlayColor);
        }
      }
      columns[x+1] = columns[x] = column;
    }

    var x = bounds.x;
    while (x < bounds.xMax) {
      interpolateColumn(x);
      x += 2;
    }
    return new VectorField(columns, bounds, mask);
  }
}

module.exports = VectorField;
