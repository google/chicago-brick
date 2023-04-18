import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { easyLog } from "../../lib/log.ts";
import { Tile, deflateTiles } from "./tile.ts";

const log = easyLog("penrose_tiles:server");

export function load(
  // Websocket connected to the client used to send messages back and forth.
  network: ModuleWSS,
  // Shared state with module's client.
  state: ModuleState,
  // Polygon representing the outer shape of the entire wall area.
  wallGeometry: Polygon,
) {
  class TemplateServer extends Server {
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
    }

    // Notification that your module has been removed from the clients.
    dispose() {}
  }

  return { server: TemplateServer };
}
