import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { deflateTiles, PenroseTilesState, Tile } from "./tile.ts";
import { easyLog } from "../../lib/log.ts";

const log = easyLog("PenroseTilesServer");

export function load(
  // Websocket connected to the client used to send messages back and forth.
  network: ModuleWSS,
  // Shared state with module's client.
  state: ModuleState,
  // Polygon representing the outer shape of the entire wall area.
  wallGeometry: Polygon,
) {
  class PenroseTilesServer extends Server {
    displayedTiles: Tile[] = [];
    previousGenTimeMs = 0;
    firstDraw = 0;
    currentGeneration = 0;

    willBeShownSoon(_deadline: number): Promise<void> | void {
      const center = wallGeometry.extents.center();

      this.displayedTiles.push(
        ...Tile.protoTiles(center, wallGeometry.extents.w / 2.5),
      );
    }

    // Notification that your module should execute a tick of work.
    tick(time: number, _delta: number) {
      if (this.previousGenTimeMs === 0) {
        this.previousGenTimeMs = time;
        this.firstDraw = time;
      }

      // Cycle through the wheel every 10 seconds
      const kiteHue = (time - this.firstDraw) / 10_000;
      const dartHue = kiteHue + 1 / 4;

      const newState: PenroseTilesState = {
        kiteHue,
        dartHue,
        newTiles: [],
      };

      if (
        this.currentGeneration < 7 && (time - this.previousGenTimeMs >= 10000 || this.firstDraw === time)
      ) {
        this.previousGenTimeMs = time;
        this.currentGeneration += 1;
        this.displayedTiles = deflateTiles(this.displayedTiles);
        newState.newTiles.push(...this.displayedTiles.map(t => t.serialize()));
      }

      state.store(
        "tiles",
        time,
        newState
      );
    }

    // Notification that your module has been removed from the clients.
    dispose() {}
  }

  return { server: PenroseTilesServer };
}
