import { Client } from "../../client/modules/module_interface.ts";
import { ModuleWS } from "../../lib/websocket.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { ModulePeer } from "../../client/network/peer.ts";
import { ModuleState } from "../../client/network/state_manager.ts";
import { Tile, P2TileType } from "./tile.ts";

export function load(
  network: ModuleWS,
  peerNetwork: ModulePeer,
  state: ModuleState,
  wallGeometry: Polygon,
) {
  class TemplateClient extends Client {
    ctx!: CanvasRenderingContext2D;
    firstDraw = 0;

    // Notification that your module has been selected next in the queue.
    willBeShownSoon(
      container: HTMLElement,
      _deadline: number,
    ): Promise<void> | void {
      this.surface = new CanvasSurface(container, wallGeometry);
    }

    // Notification that your module has started to fade in.
    beginFadeIn(_time: number) {}

    // Notification that your module has finished fading in.
    finishFadeIn() {}

    // Notification that your module should now draw.
    draw(time: number, _delta: number) {
      if (this.firstDraw === 0) {
        this.firstDraw = time;
      }

      let displayedTiles: Tile[] = []; // get from state...

      // Cycle through the wheel every 10 seconds
      const kiteHue = (time - this.firstDraw) / 10_000;
      const dartHue = kiteHue + 1 / 4;

      for (const tile of displayedTiles) {
        this.ctx.beginPath();
        this.ctx.moveTo(tile.points[0].x, tile.points[0].y);

        for (const p of tile.points.slice(1)) {
          this.ctx.lineTo(p.x, p.y);
        }

        this.ctx.closePath();
        this.ctx.stroke();

        // hard-code saturation at 100% and lightness at 50% for now
        this.ctx.fillStyle = `hsl(${
          tile.type === P2TileType.Kite ? kiteHue : dartHue
        }turn 100% 50%)`;

        this.ctx.fill();
      }
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
