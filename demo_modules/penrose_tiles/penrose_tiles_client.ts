// deno-lint-ignore-file no-unused-vars

import { Client } from "../../client/modules/module_interface.ts";
import { ModuleWS } from "../../lib/websocket.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { ModulePeer } from "../../client/network/peer.ts";
import { ModuleState } from "../../client/network/state_manager.ts";

export function load(
  // Websocket connected to the client used to send messages back and forth.
  network: ModuleWS,
  // Helper to get information about other clients.
  peerNetwork: ModulePeer,
  // Shared state with module's server.
  state: ModuleState,
  // Polygon representing the outer shape of the entire wall area.
  wallGeometry: Polygon,
) {
  class TemplateClient extends Client {
    surface: CanvasSurface | undefined = undefined;
    ctx!: CanvasRenderingContext2D;

    // Notification that your module has been selected next in the queue.
    willBeShownSoon(
      container: HTMLElement,
      _deadline: number,
    ): Promise<void> | void {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.ctx = this.surface.context;
    }

    // Notification that your module has started to fade in.
    beginFadeIn(time: number) {}

    // Notification that your module has finished fading in.
    finishFadeIn() {}

    // Notification that your module should now draw.
    draw(time: number, delta: number) {
      // Erase previous frame.
      this.ctx.clearRect(
        0, // start x
        0, // start y
        this.surface!.virtualRect.w, // width
        this.surface!.virtualRect.h, // height
      );

      // Draw circle.
      this.ctx.beginPath();
      this.ctx.arc(
        this.surface!.virtualRect.w / 2, // center x
        this.surface!.virtualRect.h / 2, // center y
        this.surface!.virtualRect.h / 3, // radius
        0, // start angle
        2 * Math.PI, // end angle
        false, // counterClockwise
      );
      this.ctx.fillStyle = "red";
      this.ctx.fill();
    }

    // Notification that your module has started to fade out.
    beginFadeOut() {}

    // Notification that your module has finished fading out.
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }
  }

  return { client: TemplateClient };
}
