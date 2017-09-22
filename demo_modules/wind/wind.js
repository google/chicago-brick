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

const d3 = require('d3');
const register = require('register');
const ModuleInterface = require('lib/module_interface');
const wallGeometry = require('wallGeometry');
const network = require('network');

const ForecastGrid = require('demo_modules/wind/forecast_grid');
const VectorField = require('demo_modules/wind/vector_field');

const canvasWidth = 1920;
const canvasHeight = 1080;
const radius = 800;
const diameter = 2*radius;

function loadJson(file) {
  return new Promise((resolve, reject) => {
    d3.json('/asset/' + file)
      .get((err, data) => {
        if (err) {
          return reject(err);
        } else {
          return resolve(data);
        }
      });
  });
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
  }

  willBeShownSoon(container, deadline) {
    const CanvasSurface = require('client/surface/canvas_surface');
    this.mapSurface = new CanvasSurface(container, wallGeometry);
    this.overlaySurface = new CanvasSurface(container, wallGeometry);

    this.projection = d3.geoOrthographic()
      .scale(diameter/2.1)
      .rotate([100, -400])
      .translate([canvasWidth/2, canvasHeight/2])
      .clipAngle(90);

    this.mapLoaded = loadJson('americas.json').then((mapData) => {
      this.mapData = mapData;
    });

    this.forecastLoaded = loadJson('current-wind-surface-level-gfs-1.0.json')
      .then((file) => {
        this.grid = new ForecastGrid(file);
        this.field = VectorField.create(this.projection, this.grid);
      });
    return Promise.all([this.mapLoaded, this.forecastLoaded]);
  }

  draw(time, delta) {
    if (!this.drawn) {
      this.drawn = true;
      this.mapLoaded.then(() => {
        return this.drawMap(this.projection, this.mapSurface.context,
            this.mapData);
      });
      this.forecastLoaded.then(() => {
        return this.drawOverlay(this.overlaySurface.context, this.field);
      });
    }
  }

  drawMap(projection, context, mapData) {
    const projectedPath = d3.geoPath().projection(projection).context(context);
    function drawSphere(context) {
      context.save();
      const grad = context.createRadialGradient(
          canvasWidth/2, canvasHeight/2, 0,
          canvasWidth/2, canvasHeight/2, radius);
      grad.addColorStop(.69, "#303030");
      grad.addColorStop(.91, "#202020");
      grad.addColorStop(.96, "#000005");
      context.fillStyle = grad;
      context.fillRect(0, 0, canvasWidth, canvasHeight);
      context.restore();
    }

    function drawGraticules(context) {
      const graticule = d3.geoGraticule();
      const equator = d3.geoGraticule().extentMinor(
          [[0, 0], [0, 0]]).stepMajor([0, 90]);
      context.save();
      context.beginPath();
      context.lineWidth = 1;
      context.strokeStyle = '#505050';
      projectedPath(graticule());
      context.stroke();
      context.restore();

      context.save();
      context.beginPath();
      context.lineWidth = 1;
      context.strokeStyle = '#808080';
      projectedPath(equator());
      context.stroke();
      context.restore();
    }

    function drawOutlines(context) {
      context.save();
      context.beginPath();
      context.lineWidth = 1;
      context.strokeStyle = '#FFF';
      projectedPath(mapData);
      context.stroke();
    }

    drawSphere(context);
    drawGraticules(context);
    drawOutlines(context);
  }

  drawOverlay(context, field) {
    context.putImageData(field.overlay, 0, 0);
  }
}

register(WindServer, WindClient);
