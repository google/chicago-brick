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

const INTENSITY_SCALE_STEP = 10;            // step size of particle intensity color scale
const MAX_PARTICLE_AGE = 100;               // max number of frames a particle is drawn before regeneration
const PARTICLE_LINE_WIDTH = 1.0;            // line width of a drawn particle
const PARTICLE_MULTIPLIER = 7;              // particle count scalar (completely arbitrary--this values looks nice)
const FRAME_RATE = 40;                      // desired milliseconds per frame

/**
 * @returns {Object} clears and returns the specified Canvas element's 2d
 * context.
 */
function clearCanvas(canvas) {
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

class Globe extends ModuleInterface.Server {
  willBeShownSoon(container, deadline) {
    return Promise.resolve();
	}
}

class GlobeClient extends ModuleInterface.Client {
  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
  }

  drawMap(projection, context, mapData) {
    const projectedPath = d3.geo.path().projection(projection).context(context);
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
      const graticule = d3.geo.graticule();
      const equator = d3.geo.graticule().minorExtent(
          [[0, 0], [0, 0]]).majorStep([0, 90]);
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

  loadJson(file) {
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

  willBeShownSoon(container, deadline) {
    const CanvasSurface = require('client/surface/canvas_surface');
    const mapSurface = new CanvasSurface(container, wallGeometry);
    const overlaySurface = new CanvasSurface(container, wallGeometry);
    const visSurface = new CanvasSurface(container, wallGeometry);

    const projection = d3.geo.orthographic()
      .scale(diameter/2.1)
      .rotate([100, -400])
      .translate([canvasWidth/2, canvasHeight/2])
      .clipAngle(90);


    const mapData = this.loadJson('americas.json').then((data) => {
      return this.drawMap(projection, mapSurface.context, data);
    });

    const grid = this.loadJson('current-wind-surface-level-gfs-1.0.json').then((file) => {
      this.grid = new ForecastGrid(file);
      this.field = VectorField.create(projection, this.grid);
    })

    return Promise.all([mapData, grid]).then(() => {
      clearCanvas(overlaySurface.canvas);
      this.drawOverlay(overlaySurface.context, this.field);
    });
  }

  draw(time, delta) {
    //this.surface.render();
  }
}

register(Globe, GlobeClient);
