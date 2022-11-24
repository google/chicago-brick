import { add, len2, Point, scale } from "../../lib/math/vector2d.ts";
import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Destination } from "./messages.ts";

function complexMult(a: Point, b: Point) {
  return {
    x: a.x * b.x - a.y * b.y,
    y: a.x * b.y + a.y * b.x,
  };
}

function isInsideSet(c: Point) {
  let z = c;
  for (let i = 0; i < 50; ++i) {
    z = add(complexMult(z, z), c);
    if (len2(z) > 4) {
      return false;
    }
  }
  return true;
}

export function load(state: ModuleState) {
  class MandelbrotServer extends Server {
    willBeShownSoon() {
      const randomPoints: Destination[] = Array.from(
        { length: 50 },
        () => this.chooseRandomPointNearEdge(),
      );

      state.store("points", 0, randomPoints);
    }
    chooseRandomPointNearEdge() {
      // Pick a random direction.
      const angle = Math.random() * 2 * Math.PI;

      // Turn this into a fixed delta.
      const delta: Point = { x: 4 * Math.cos(angle), y: 4 * Math.sin(angle) };

      // Initialize an accumulator that starts inside the set.
      let insideAcc: Point = Math.random() < 0.6
        ? { x: 0, y: 0 }
        : { x: -1, y: 0 };

      // Initialize an accumulator that starts outside the set.
      let outsideAcc: Point = add(insideAcc, delta);

      // Now, with a limit, try to find a point on the edge.
      for (let i = 0; i < 15; ++i) {
        // Pick the point between inside and outside.
        const test = scale(add(insideAcc, outsideAcc), 0.5);

        // Is this in the set? Update the right endpoint.
        if (isInsideSet(test)) {
          insideAcc = test;
        } else {
          outsideAcc = test;
        }
      }

      // Okay, we got ourselves a point.
      const point = scale(add(insideAcc, outsideAcc), 0.5);
      return {
        x: point.x,
        y: point.y,
        r: Math.max(
          Math.abs(outsideAcc.x - insideAcc.x),
          Math.abs(outsideAcc.y - insideAcc.y),
        ),
      };
    }
  }

  return { server: MandelbrotServer };
}
