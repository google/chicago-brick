import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { Tile, P2TileType, deflateTiles } from "./tile.ts";

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

      if (
        this.currentGeneration < 7 && time - this.previousGenTimeMs >= 10000
      ) {
        this.previousGenTimeMs = time;
        this.currentGeneration += 1;
        this.displayedTiles = deflateTiles(this.displayedTiles);
      }

      // Cycle through the wheel every 10 seconds
      const kiteHue = (time - this.firstDraw) / 10_000;
      const dartHue = kiteHue + 1 / 4;

      state.store("tiles", time, this.displayedTiles.map(t => t.serializeWithHue(t.type === P2TileType.Kite ? kiteHue : dartHue)));
    }

    // Notification that your module has been removed from the clients.
    dispose() {}
  }

  return { server: PenroseTilesServer };
}
