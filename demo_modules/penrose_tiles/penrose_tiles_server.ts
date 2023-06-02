import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import {
  GEN_LENGTH_MILLIS,
  GOOGLE_COLORS_600_HSL,
  MAX_GENS,
} from "./constants.ts";

// Plain ol' lerp
function interpolate(a: number, b: number, t: number) {
  return a + (b - a) * (t % 1);
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

      const genPosition = (time - this.firstDraw) / GEN_LENGTH_MILLIS;

      const cycleIdx = Math.trunc(genPosition * 8) % 8;
      const evenCycle = cycleIdx % 2 === 0; // we transition to the next color on the even, hold the next color on odd

      const baseKiteColorIdx = Math.trunc(cycleIdx / 2);
      const nextKiteColorIdx = (baseKiteColorIdx + 1) % 4;

      const baseDartColorIdx = nextKiteColorIdx;
      const nextDartColorIdx = (baseDartColorIdx + 1) % 4;

      const baseKiteColor = GOOGLE_COLORS_600_HSL[baseKiteColorIdx];
      const nextKiteColor = GOOGLE_COLORS_600_HSL[nextKiteColorIdx];
      const baseDartColor = GOOGLE_COLORS_600_HSL[baseDartColorIdx];
      const nextDartColor = GOOGLE_COLORS_600_HSL[nextDartColorIdx];

      const kiteHue = evenCycle
        ? interpolate(
          baseKiteColor.hue,
          nextKiteColor.hue > baseKiteColor.hue
            ? nextKiteColor.hue
            : nextKiteColor.hue + 1,
            genPosition * 8,
        )
        : nextKiteColor.hue;

      const kiteSat = evenCycle
        ? interpolate(
          baseKiteColor.sat,
          nextKiteColor.sat,
          genPosition * 8,
        )
        : nextKiteColor.sat;

      const kiteLgt = evenCycle
        ? interpolate(
          baseKiteColor.lgt,
          nextKiteColor.lgt,
          genPosition * 8,
        )
        : nextKiteColor.lgt;

      const dartHue = evenCycle
        ? interpolate(
          baseDartColor.hue,
          nextDartColor.hue > baseDartColor.hue
            ? nextDartColor.hue
            : nextDartColor.hue + 1,
            genPosition * 8,
        )
        : nextDartColor.hue;

      const dartSat = evenCycle
        ? interpolate(
          baseDartColor.sat,
          nextDartColor.sat,
          genPosition * 8,
        )
        : nextDartColor.sat;

      const dartLgt = evenCycle
        ? interpolate(
          baseDartColor.lgt,
          nextDartColor.lgt,
          genPosition * 8,
        )
        : nextDartColor.lgt;

      // Change generations every cycle up to MAX_GENS-1
      const currentGeneration = Math.min(
        Math.floor(genPosition),
        MAX_GENS - 1,
      );

      state.store(
        "tiles",
        time,
        {
          currentGeneration,
          kiteHue,
          kiteSat,
          kiteLgt,
          dartHue,
          dartSat,
          dartLgt,
        },
      );
    }
  }

  return { server: PenroseTilesServer };
}
