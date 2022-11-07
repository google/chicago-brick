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

import { GOOGLE_COLORS, Shape } from "./colors.ts";
import { Server } from "../../server/modules/module_interface.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";

// Returns true if circles defined by a and b overlap.
function checkOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const x = ax - bx;
  const y = ay - by;
  const dist = Math.sqrt(x * x + y * y);
  return dist < ar + br;
}

export function load(network: ModuleWSS, wallGeometry: Polygon) {
  // Set to true to enable console spam!
  const VERBOSE = false;

  // Number of shapes to create each time we try to create shapes.
  const NUM_SHAPES = 40;

  class ChaosServer extends Server {
    // The time we last tried to place a new shape.
    oldtime = -Infinity;
    // The time we last sent information to the clients about the shapes.
    oldsend = -Infinity;
    // The shape data.
    shapes: Shape[] = [];
    // A counter indicating how many times we've added shapes.
    build = 0;

    tick(time: number) {
      if (time > this.oldtime + (1000 * 60)) {
        this.oldtime = time;
        // Reset shape data (effectively blanking the screen).
        this.shapes = [];
        // Initial size of shape to make. If we can't find a fit, we decrease this and try again.
        // TODO(applmak): I suspect that this is redundant with 'size', and we just use 'size' everywhere.
        let makeRadius = 0.30;

        // Make NUM_SHAPES shapes! Don't increment shapeCount unless we find a place to put a shape.
        // TODO(applmak): This has the potential to run forever, and be the cause of the issues with
        // this module. Rather than running forever, switch it to try no more than 1000 times or
        // some such.
        for (let shapeCount = 0; shapeCount < NUM_SHAPES;) {
          const posx = wallGeometry.extents.w * Math.random();
          const posy = wallGeometry.extents.h * Math.random();
          let size = Math.min(wallGeometry.extents.w, wallGeometry.extents.h) *
            makeRadius;

          // Presume that this is going to fit just fine, then try all the other shapes we made in
          // an attempt to find any overlap.
          let fit = true;
          for (let otherShape = 0; otherShape < shapeCount; ++otherShape) {
            const shape = this.shapes[otherShape];
            // Check to ensure that our new shape isn't too close to any shape we made so far.
            if (
              checkOverlap(posx, posy, size, shape.posx, shape.posy, shape.size)
            ) {
              // If it is, we decrease our size, abort the overlap check, and try again.
              fit = false;
              makeRadius *= 0.99;
              if (VERBOSE) console.log("No fit " + makeRadius);
              break;
            }
          }
          if (fit) {
            // Maybe our initial guess as to the size was too conservative. Make it bigger, see if it still fits.
            let fit = (shapeCount > 2);
            // Try to make it bigger 30 times.
            for (let count = 0; fit && count < 30; ++count) {
              if (VERBOSE) console.log("bigger " + count);
              makeRadius *= 1.05;
              size = Math.min(wallGeometry.extents.w, wallGeometry.extents.h) *
                makeRadius;
              // TODO(applmak): This check against existing shapes is similar to the other one.
              // Extract it as a function.
              for (let otherShape = 0; otherShape < shapeCount; ++otherShape) {
                const shape = this.shapes[otherShape];
                if (
                  checkOverlap(
                    posx,
                    posy,
                    size,
                    shape.posx,
                    shape.posy,
                    shape.size,
                  )
                ) {
                  fit = false;
                  makeRadius /= 1.05;
                  size =
                    Math.min(wallGeometry.extents.w, wallGeometry.extents.h) *
                    makeRadius;
                }
              }
            }

            if (VERBOSE) console.log("Adding " + shapeCount);
            const shape = { posx, posy, size };
            this.shapes[shapeCount] = shape as Shape;
            shapeCount++;
          }
        }
        // We placed NUM_SHAPES shapes!
        for (let shapeCount = 0; shapeCount < NUM_SHAPES; ++shapeCount) {
          const myColorIndex = Math.floor(Math.random() * GOOGLE_COLORS.length);
          const alpha = Math.random() * 360.0; // degrees of random rotation to add
          // Pick a number of points for this shape. 4 is a boring number of points (solid square), so
          // if we pick 4, try again.
          let points = 3;
          do {
            points = 3 + Math.floor(Math.random() * 10);
          } while (points == 4);

          const shape = this.shapes[shapeCount];
          shape.myColorIndex = myColorIndex;
          shape.alpha = alpha;
          shape.points = points;
        }
        this.build++;
      }

      // Send information about the layout of the wall to the clients.
      if (time > this.oldsend + (1000)) {
        this.oldsend = time;
        network.send("chaos", {
          time: this.build,
          shapes: this.shapes,
        });
      }
    }
  }

  return { server: ChaosServer };
}
