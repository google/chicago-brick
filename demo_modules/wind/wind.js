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

const d3 = require('d3');
const register = require('register');
const ModuleInterface = require('lib/module_interface');
const wallGeometry = require('wallGeometry');
const network = require('network');

const ForecastGrid = require('./forecast_grid');
const ParticleField = require('./particle_field');
const VectorField = require('./vector_field');
const Mask = require('./mask');

const ROTATEX = 100;
const ROTATEY = -400;

function loadJson(file) {
  return new Promise((resolve, reject) => {
    const asset = require('client/asset/asset');
    d3.json(asset(file))
      .get((err, data) => {
        if (err) {
          return reject(err);
        } else {
          return resolve(data);
        }
      });
  });
}

function ensureNumber(num, fallback) {
  return _.isFinite(num) || num === Infinity || num === -Infinity ? num : fallback;
}

/**
 * @param bounds the projection bounds: [[x0, y0], [x1, y1]]
 * @param width
 * @param height
 * @returns {Object} the projection bounds clamped to the specified view.
 */
function clampedBounds(bounds, x, y, width, height) {
  const upperLeft = bounds[0];
  const lowerRight = bounds[1];
  const xMin = Math.max(Math.floor(ensureNumber(upperLeft[0], x)), x);
  const yMin = Math.max(Math.floor(ensureNumber(upperLeft[1], y)), y);
  const xMax = Math.min(Math.ceil(ensureNumber(lowerRight[0], x + width)), x + width - 1);
  const yMax = Math.min(Math.ceil(ensureNumber(lowerRight[1], y + height)), y + height - 1);
  return {x: xMin, y: yMin, xMax, yMax, width: xMax - xMin + 1, height: yMax - yMin + 1};
}

class WindServer extends ModuleInterface.Server {
  willBeShownSoon(container, deadline) {
    return Promise.resolve();
  }
}

class WindClient extends ModuleInterface.Client {
  finishFadeOut() {
    this.mapSurface.destroy();
    this.overlaySurface.destroy();
    this.animationSurface.destroy();
  }

  willBeShownSoon(container, deadline) {
    const CanvasSurface = require('client/surface/canvas_surface');
    const clientInfo = require('client/util/info');
    this.virtualRect = clientInfo.virtualRect;
    this.globalRect = wallGeometry.extents;

    this.mapSurface = new CanvasSurface(container, wallGeometry);
    this.overlaySurface = new CanvasSurface(container, wallGeometry);
    this.animationSurface = new CanvasSurface(container, wallGeometry);

    this.scale = 2.5 * (wallGeometry.extents.w / 3);

    this.projection = d3.geoOrthographic()
      .scale(this.scale)
      .rotate([ROTATEX, ROTATEY])
      .translate([wallGeometry.extents.w/2 - this.virtualRect.x,
                  wallGeometry.extents.h/2 - this.virtualRect.y])
      .clipAngle(90);

    // Bounds relative to the virtual rectangle.
    this.bounds = clampedBounds(
        d3.geoPath().projection(this.projection).bounds({type: "Sphere"}),
        0, 0, this.virtualRect.w, this.virtualRect.h);

    this.mapLoaded = Promise.all([
        loadJson('wind-coastline.json').then((coastline) => {
          this.coastline = coastline;
        }),
        loadJson('wind-lakes.json').then((lakes) => {
          this.lakes = lakes;
        })
    ]);

    this.dataProcessed = loadJson('wind-current-surface-level-gfs-1.0.json')
      .then((file) => {
        this.grid = new ForecastGrid(file);
        this.mask = new Mask(this.projection, this.virtualRect, this.globalRect);
        this.vectorField = VectorField.create(this.projection, this.mask,
          this.bounds, this.grid);
      }).then(() => {
        this.particleField = new ParticleField(this.bounds,
            this.grid, this.vectorField, this.animationSurface.context);
      });
    return Promise.all([this.mapLoaded, this.dataProcessed]);
  }

  draw(time, delta) {
    if (this.particleField) {
      if (!this.mapDrawn) {
        this.drawMap(this.projection, this.mapSurface.context, this.coastline,
            this.lakes);
        this.drawOverlay(this.overlaySurface.context, this.vectorField);
        this.particleField.draw();
        this.mapDrawn = true;
      } else {
        this.particleField.evolve();
        this.particleField.draw();
      }
    }
  }

  drawMap(projection, context, coastline, lakes) {
    const projectedPath = d3.geoPath().projection(projection).context(context);
    const bounds = d3.geoPath().projection(this.projection).bounds({type: "Sphere"});
    const r = (bounds[1][0] - bounds[0][0]) / 2;

    function drawSphere(context, virtualRect) {
      const grad = context.createRadialGradient(
        wallGeometry.extents.w/2 - virtualRect.x, wallGeometry.extents.h/2 - virtualRect.y, 0,
        wallGeometry.extents.w/2 - virtualRect.x, wallGeometry.extents.h/2 - virtualRect.y, r);
      grad.addColorStop(.69, "#303030");
      grad.addColorStop(.91, "#202020");
      grad.addColorStop(.96, "#000005");
      context.fillStyle = grad;
      context.fillRect(0, 0, wallGeometry.extents.w,
        wallGeometry.extents.h);
    }

    function drawGraticules(context) {
      const graticule = d3.geoGraticule();
      const equator = d3.geoGraticule().extentMinor(
          [[0, 0], [0, 0]]).stepMajor([0, 90]);
      context.beginPath();
      context.lineWidth = 1;
      context.strokeStyle = '#505050';
      projectedPath(graticule());
      context.stroke();

      context.beginPath();
      context.lineWidth = 1;
      context.strokeStyle = '#808080';
      projectedPath(equator());
      context.stroke();
    }

    function drawOutlines(context) {
      context.beginPath();
      context.lineWidth = 1;
      context.strokeStyle = '#FFF';
      projectedPath(coastline);
      context.stroke();

      context.beginPath();
      context.lineWidth = 1;
      context.strokeStyle = '#FFF';
      projectedPath(lakes);
      context.stroke();
    }

    drawSphere(context, this.virtualRect);
    drawGraticules(context);
    drawOutlines(context);
  }

  drawOverlay(context, vectorField) {
    context.putImageData(vectorField.overlay, 0, 0);
  }
}

register(WindServer, WindClient);
