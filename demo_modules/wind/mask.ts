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

// Most of this code borrowed or derived from the awesome weather visualization
// at https://earth.nullschool.net and its open source code:
// https://github.com/cambecc/earth.

import * as d3 from "https://deno.land/x/d3_4_deno@v6.2.0.9/src/mod.js";
import { easyLog } from "../../lib/log.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import { Color } from "./color.ts";

const debug = easyLog("wind:mask");

export class Mask {
  context: CanvasRenderingContext2D;
  width: number;
  imageData: ImageData;
  constructor(
    projection: d3.GeoProjection,
    virtualRect: Rectangle,
    globalRect: Rectangle,
  ) {
    // Create a detached canvas, draw an opaque sphere that represents visible
    // points.
    const canvas = d3.select(document.createElement("canvas"))
      .attr("width", globalRect.w).attr("height", globalRect.h).node()!;
    this.context = canvas.getContext("2d")!;
    this.width = virtualRect.w;

    const projectedPath = d3.geoPath().projection(projection).context(
      this.context,
    );

    projectedPath({ type: "Sphere" });
    this.context.fillStyle = "rgba(255, 0, 0, 1)";
    this.context.fill();

    // layout: [r, g, b, a, r, g, b, a, ...]
    this.imageData = this.context.getImageData(
      0,
      0,
      virtualRect.w,
      virtualRect.h,
    );

    debug(`Image data: ${this.imageData.data.length}`);
  }

  isVisible(x: number, y: number) {
    const i = (y * this.width + x) * 4;
    return this.imageData.data[i + 3] > 0; // non-zero alpha means pixel is visible
  }

  set(x: number, y: number, rgba: Color) {
    const i = (y * this.width + x) * 4;
    this.imageData.data[i] = rgba[0];
    this.imageData.data[i + 1] = rgba[1];
    this.imageData.data[i + 2] = rgba[2];
    this.imageData.data[i + 3] = rgba[3] ?? 255;
    return this;
  }
}
