import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";

export function load(
  // Websocket connected to the client used to send messages back and forth.
  network: ModuleWSS,
  // Shared state with module's client.
  state: ModuleState,
  // Polygon representing the outer shape of the entire wall area.
  wallGeometry: Polygon,
) {
  class TemplateServer extends Server {
    willBeShownSoon(_deadline: number): Promise<void> | void {
    }

    // Notification that your module should execute a tick of work.
    tick(_time: number, _delta: number) {
    }

    // Notification that your module has been removed from the clients.
    dispose() {}
  }

  return { server: TemplateServer };
}
