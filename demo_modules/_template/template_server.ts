import { Server } from "../../server/modules/module_interface.ts";
import { Logger } from "../../lib/log.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { assert as libAssert } from "../../lib/assert.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";

export function load(
  // Generic assertion util.
  _assert: typeof libAssert,
  // Default logging lib, with multiple levels.
  _debug: Logger,
  // Websocket connected to the client used to send messages back and forth.
  _network: ModuleWSS,
  // Shared state with module's client.
  _state: ModuleState,
  // Polygon representing the outer shape of the entire wall area.
  _wallGeometry: Polygon,
) {
  class TemplateServer extends Server {
    // Notification that your module has been selected next in the queue.
    willBeShownSoon(_deadline: number): Promise<void> | void {}

    // Notification that your module should execute a tick of work.
    tick(_time: number, _delta: number) {}

    // Notification that your module has been removed from the clients.
    dispose() {}
  }

  return { server: TemplateServer };
}
