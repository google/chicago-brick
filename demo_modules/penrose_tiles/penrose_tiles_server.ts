// deno-lint-ignore-file no-unused-vars

import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { Tile, TileType, PI_OVER_5 } from "./tile.ts";

export function load(
  // Websocket connected to the client used to send messages back and forth.
  network: ModuleWSS,
  // Shared state with module's client.
  state: ModuleState,
  // Polygon representing the outer shape of the entire wall area.
  wallGeometry: Polygon,
) {
  class TemplateServer extends Server {
    readonly protoTiles: Tile[] = [];

    willBeShownSoon(deadline: number): Promise<void> | void {
      const center = wallGeometry.extents.center();

      for (let a = Math.PI / 2 + PI_OVER_5; a < 3 * Math.PI; a += 2 * PI_OVER_5) {
        this.protoTiles.push(new Tile(center.x, center.y, a, wallGeometry.extents.w / 2.5, TileType.Kite));
      }
    }

    // Notification that your module should execute a tick of work.
    tick(time: number, delta: number) {
      const newTiles = this.protoTiles;
      // TODO(aarestad): New generation every 10 seconds; zoom in-between
      state.store("tiles", time, newTiles);
    }

    // Notification that your module has been removed from the clients.
    dispose() {}
  }

  return { server: TemplateServer };
}
