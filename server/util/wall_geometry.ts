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

import { Polygon } from "../../lib/math/polygon2d.ts";
import { easyLog } from "../../lib/log.ts";
import { flags } from "../flags.ts";

const log = easyLog("wall:wall_geometry");

interface Point {
  x: number;
  y: number;
}

interface TurtleCommand {
  left?: number;
  up?: number;
  right?: number;
  down?: number;
}

// Returns a polygon that entirely contains the wall geometry. NOTE: any point
// to the left of the polygon is outside of it, because we assume that points
// are addressed from the top-left pixel.
function parseGeometry(polygonPoints: TurtleCommand[]): Polygon {
  const points = polygonPoints.reduce((agg, point) => {
    const last = agg[agg.length - 1];
    let next: Point;
    if (point.right) {
      next = { x: last.x + point.right, y: last.y };
    } else if (point.down) {
      next = { x: last.x, y: last.y + point.down };
    } else if (point.left) {
      next = { x: last.x - point.left, y: last.y };
    } else if (point.up) {
      next = { x: last.x, y: last.y - point.up };
    } else {
      throw new Error(`Malformed turtle command: ${JSON.stringify(point)}`);
    }
    agg.push(next);
    return agg;
  }, [{ x: 0, y: 0 }]);

  return new Polygon(points);
}

export function loadGeometry(path: string): TurtleCommand[] {
  // Convert from config description to actual polygon.
  const config = JSON.parse(Deno.readTextFileSync(path));
  return config.polygon;
}

let geo: Polygon;

export function getGeo() {
  return geo;
}

// TODO(applmak): Geometry specified as a single polygon doesn't really accurately reflect what's going on
// on an actual wall, which has a bunch of rectangles slightly offset from one another. Instead of a poly,
// switch the model generating a concave hull of the screens as they load in, which becomes the poly.
export function init() {
  let xscale = 1920;
  let yscale = 1080;
  if (flags.screen_width) {
    xscale = flags.screen_width;
    yscale = xscale * 1080 / 1920;
  }

  if (!flags.use_geometry && !flags.geometry_file) {
    log.warn("No wall geometry specified... assuming 1x1.");
    geo = parseGeometry([{ "right": 1 }, { "down": 1 }, { "left": 1 }, {
      "up": 1,
    }]).scale(xscale, yscale);
  } else if (flags.use_geometry) {
    geo = parseGeometry(flags.use_geometry).scale(xscale, yscale);
  } else if (flags.geometry_file) {
    // Note that the geometry loaded from a file isn't scaled.
    geo = parseGeometry(loadGeometry(flags.geometry_file)).scale(
      xscale,
      yscale,
    );
  }
}
