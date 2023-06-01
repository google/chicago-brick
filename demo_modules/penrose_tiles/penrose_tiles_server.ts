import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import {
  GEN_LENGTH_MILLIS,
  GOOGLE_COLORS_600_HSL,
  MAX_GENS,
} from "./constants.ts";

// Plain ol' lerp
// If b < a, add one to b first (this assumes |b - a| < 1)
function interpolate(a: number, b: number, t: number) {
  if (b < a) {
    b += 1;
  }

  let lerp = a + (b - a) * (t % 1);

  if (lerp > 1) {
    lerp -= 1;
  }

  return lerp;
}

export function load(state: ModuleState) {
  class PenroseTilesServer extends Server {
    previousGenTimeMs = 0;
    firstDraw = 0;
    currentGeneration = 0;

    tick(time: number, _delta: number) {
      if (this.previousGenTimeMs === 0) {
        this.previousGenTimeMs = time;
        this.firstDraw = time;
      }

      const cyclePosition = (time - this.firstDraw) / GEN_LENGTH_MILLIS;

      const cycleIdx = Math.trunc(cyclePosition * 8) % 8;
      const evenCycle = cycleIdx % 2 === 0; // we transition to the next color on the even, hold the next color on odd

      const baseKiteColorIdx = Math.trunc(cycleIdx / 2);
      const nextKiteColorIdx = (baseKiteColorIdx + 1) % 4;

      const baseDartColorIdx = nextKiteColorIdx;
      const nextDartColorIdx = (baseDartColorIdx + 1) % 4;

      const baseKiteColor = GOOGLE_COLORS_600_HSL[baseKiteColorIdx];
      const nextKiteColor = GOOGLE_COLORS_600_HSL[nextKiteColorIdx];
      const baseDartColor = GOOGLE_COLORS_600_HSL[baseDartColorIdx];
      const nextDartColor = GOOGLE_COLORS_600_HSL[nextDartColorIdx];

      const kiteHue = evenCycle ? interpolate(
        baseKiteColor.hue,
        nextKiteColor.hue,
        cyclePosition * 4,
      ) : nextKiteColor.hue;

      const dartHue = evenCycle ? interpolate(
        baseDartColor.hue,
        nextDartColor.hue,
        cyclePosition * 4,
      ) : nextDartColor.hue;

      // Change generations every cycle up to MAX_GENS-1
      const currentGeneration = Math.min(
        Math.floor(cyclePosition),
        MAX_GENS - 1,
      );

      state.store(
        "tiles",
        time,
        {
          currentGeneration,
          kiteHue,
          dartHue,
        },
      );
    }
  }

  return { server: PenroseTilesServer };
}
