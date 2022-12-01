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

import { Client } from "../../client/modules/module_interface.ts";
import * as d3 from "https://deno.land/x/d3_4_deno@v6.2.0.9/src/mod.js";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import { Bounds } from "./util.ts";
import { ForecastGrid, ForecastJson } from "./forecast_grid.ts";
import { Mask } from "./mask.ts";
import { VectorField } from "./vector_field.ts";
import { ParticleField } from "./particle_field.ts";

const ROTATEX = 100;
const ROTATEY = -400;

async function loadJson<T>(file: string): Promise<T> {
  const asset = await import(`/asset/${file}`, { assert: { type: "json" } });
  return asset.default as T;
}

function ensureNumber(num: number, fallback: number) {
  return isFinite(num) || num === Infinity || num === -Infinity
    ? num
    : fallback;
}

/**
 * @param bounds the projection bounds: [[x0, y0], [x1, y1]]
 * @param width
 * @param height
 * @returns {Object} the projection bounds clamped to the specified view.
 */
function clampedBounds(
  bounds: [[number, number], [number, number]],
  x: number,
  y: number,
  width: number,
  height: number,
): Bounds {
  const upperLeft = bounds[0];
  const lowerRight = bounds[1];
  const xMin = Math.max(Math.floor(ensureNumber(upperLeft[0], x)), x);
  const yMin = Math.max(Math.floor(ensureNumber(upperLeft[1], y)), y);
  const xMax = Math.min(
    Math.ceil(ensureNumber(lowerRight[0], x + width)),
    x + width - 1,
  );
  const yMax = Math.min(
    Math.ceil(ensureNumber(lowerRight[1], y + height)),
    y + height - 1,
  );
  return {
    x: xMin,
    y: yMin,
    xMax,
    yMax,
    width: xMax - xMin + 1,
    height: yMax - yMin + 1,
  };
}

export function load(wallGeometry: Polygon) {
  class WindClient extends Client {
    mapSurface!: CanvasSurface;
    virtualRect!: Rectangle;
    globalRect!: Rectangle;
    overlaySurface!: CanvasSurface;
    animationSurface!: CanvasSurface;
    scale = 1;
    projection!: d3.GeoProjection;
    bounds!: Bounds;
    coastline!: d3.GeoPermissibleObjects;
    lakes!: d3.GeoPermissibleObjects;
    grid!: ForecastGrid;
    mask!: Mask;
    vectorField!: VectorField;
    particleField!: ParticleField;
    mapDrawn = false;

    async willBeShownSoon(container: HTMLElement) {
      this.mapSurface = new CanvasSurface(container, wallGeometry);
      this.overlaySurface = new CanvasSurface(container, wallGeometry);
      this.animationSurface = new CanvasSurface(container, wallGeometry);

      this.virtualRect = this.mapSurface.virtualRect;
      this.globalRect = wallGeometry.extents;

      this.scale = wallGeometry.extents.h * 1.2;

      this.projection = d3.geoOrthographic()
        .scale(this.scale)
        .rotate([ROTATEX, ROTATEY])
        .translate([
          wallGeometry.extents.w / 2 - this.virtualRect.x,
          wallGeometry.extents.h / 2 - this.virtualRect.y,
        ])
        .clipAngle(90);

      // Bounds relative to the virtual rectangle.
      this.bounds = clampedBounds(
        d3.geoPath().projection(this.projection).bounds({ type: "Sphere" }),
        0,
        0,
        this.virtualRect.w,
        this.virtualRect.h,
      );
      this.coastline = await loadJson<d3.GeoPermissibleObjects>(
        "wind-coastline.json",
      );
      this.lakes = await loadJson<d3.GeoPermissibleObjects>("wind-lakes.json");

      const windData = await loadJson<ForecastJson[]>(
        "wind-current-surface-level-gfs-1.0.json",
      );
      this.grid = new ForecastGrid(windData);
      this.mask = new Mask(
        this.projection,
        this.virtualRect,
        this.globalRect,
      );
      this.vectorField = VectorField.create(
        this.projection,
        this.mask,
        this.bounds,
        this.grid,
      );
      this.particleField = new ParticleField(
        this.bounds,
        this.grid,
        this.vectorField,
        this.animationSurface.context,
      );
    }

    finishFadeOut() {
      this.mapSurface.destroy();
      this.overlaySurface.destroy();
      this.animationSurface.destroy();
    }

    draw() {
      if (this.particleField) {
        if (!this.mapDrawn) {
          this.drawMap(
            this.projection,
            this.mapSurface.context,
            this.coastline,
            this.lakes,
          );
          this.drawOverlay(this.overlaySurface.context, this.vectorField);
          this.particleField.draw();
          this.mapDrawn = true;
        } else {
          this.particleField.evolve();
          this.particleField.draw();
        }
      }
    }

    drawMap(
      projection: d3.GeoProjection,
      context: CanvasRenderingContext2D,
      coastline: d3.GeoPermissibleObjects,
      lakes: d3.GeoPermissibleObjects,
    ) {
      const projectedPath = d3.geoPath().projection(projection).context(
        context,
      );
      const bounds = d3.geoPath().projection(this.projection).bounds({
        type: "Sphere",
      });
      const r = (bounds[1][0] - bounds[0][0]) / 2;

      function drawSphere(
        context: CanvasRenderingContext2D,
        virtualRect: Rectangle,
      ) {
        const grad = context.createRadialGradient(
          wallGeometry.extents.w / 2 - virtualRect.x,
          wallGeometry.extents.h / 2 - virtualRect.y,
          0,
          wallGeometry.extents.w / 2 - virtualRect.x,
          wallGeometry.extents.h / 2 - virtualRect.y,
          r,
        );
        grad.addColorStop(.69, "#303030");
        grad.addColorStop(.91, "#202020");
        grad.addColorStop(.96, "#000005");
        context.fillStyle = grad;
        context.fillRect(0, 0, wallGeometry.extents.w, wallGeometry.extents.h);
      }

      function drawGraticules(context: CanvasRenderingContext2D) {
        const graticule = d3.geoGraticule();
        const equator = d3.geoGraticule().extentMinor(
          [[0, 0], [0, 0]],
        ).stepMajor([0, 90]);
        context.beginPath();
        context.lineWidth = 1;
        context.strokeStyle = "#505050";
        projectedPath(graticule());
        context.stroke();

        context.beginPath();
        context.lineWidth = 1;
        context.strokeStyle = "#808080";
        projectedPath(equator());
        context.stroke();
      }

      function drawOutlines(context: CanvasRenderingContext2D) {
        context.beginPath();
        context.lineWidth = 2;
        context.strokeStyle = "#FFF";
        projectedPath(coastline);
        context.stroke();

        context.beginPath();
        context.lineWidth = 2;
        context.strokeStyle = "#FFF";
        projectedPath(lakes);
        context.stroke();
      }

      drawSphere(context, this.virtualRect);
      drawGraticules(context);
      drawOutlines(context);
    }

    drawOverlay(context: CanvasRenderingContext2D, vectorField: VectorField) {
      context.putImageData(vectorField.overlay, 0, 0);
    }
  }
  return { client: WindClient };
}
