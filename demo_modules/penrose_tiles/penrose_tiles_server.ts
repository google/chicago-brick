import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { deflateTiles, Tile, TileGenerations } from "./tile.ts";

export function load(
  state: ModuleState,
  wallGeometry: Polygon,
) {
  const MAX_GENS = 7;
  const CYCLE_LENGTH_MILLIS = 5_000;

  class PenroseTilesServer extends Server {
    previousGenTimeMs = 0;
    firstDraw = 0;
    currentGeneration = 0;

    willBeShownSoon(_deadline: number): Promise<void> | void {
      const center = wallGeometry.extents.center();

      let lastGen = Tile.protoTiles(center, wallGeometry.extents.w / 2.5);

      const tileGenerations: TileGenerations = [] as TileGenerations;

      tileGenerations[0] = lastGen.map((t) => t.serialize());

      for (let i = 1; i < MAX_GENS; ++i) {
        // Deflate the tiles, then de-dupe them by id (i.e. its center)
        lastGen = deflateTiles(lastGen);
        // lastGen = Array.from(new Map(lastGen.map((t) => [t.id, t])).values());
        tileGenerations[i] = lastGen.map((t) => t.serialize());
      }

      state.store(
        "tiles",
        0,
        {
          currentGeneration: 0,
          kiteHue: 0,
          dartHue: 1 / 4,
          tileGenerations,
        },
      );
    }

    // Notification that your module should execute a tick of work.
    tick(time: number, _delta: number) {
      if (this.previousGenTimeMs === 0) {
        this.previousGenTimeMs = time;
        this.firstDraw = time;
      }

      // Cycle through the wheel every 10 seconds
      const kiteHue = (time - this.firstDraw) / CYCLE_LENGTH_MILLIS;
      const dartHue = kiteHue + 1 / 4;
      // Change generations every cycle up to MAX_GENS-1
      const currentGeneration = Math.min(Math.floor(kiteHue), MAX_GENS - 1);

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

    // Notification that your module has been removed from the clients.
    dispose() {}
  }

  return { server: PenroseTilesServer };
}
