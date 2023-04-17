import { Client } from "../../client/modules/module_interface.ts";
import { ModuleWS } from "../../lib/websocket.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { ModulePeer } from "../../client/network/peer.ts";
import { ModuleState } from "../../client/network/state_manager.ts";
import { deflateTiles, Tile, TileType } from "./tile.ts";

export function load(
  // Websocket connected to the client used to send messages back and forth.
  _network: ModuleWS,
  // Helper to get information about other clients.
  _peerNetwork: ModulePeer,
  // Shared state with module's server.
  _state: ModuleState,
  // Polygon representing the outer shape of the entire wall area.
  wallGeometry: Polygon,
) {
  class TemplateClient extends Client {
    surface: CanvasSurface | undefined = undefined;
    ctx!: CanvasRenderingContext2D;
    readonly protoTiles?: Tile[] = [];
    displayedTiles: Tile[] = [];
    currentGeneration = 0;
    firstDraw = 0;
    previousGenTimeMs = 0;

    // Notification that your module has been selected next in the queue.
    willBeShownSoon(
      container: HTMLElement,
      _deadline: number,
    ): Promise<void> | void {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.ctx = this.surface.context;

      const center = wallGeometry.extents.center();

      this.displayedTiles.push(...Tile.protoTiles(center, wallGeometry.extents.w / 2.5));
    }

    // Notification that your module has started to fade in.
    beginFadeIn(_time: number) {}

    // Notification that your module has finished fading in.
    finishFadeIn() {}

    // Notification that your module should now draw.
    draw(time: number, _delta: number) {
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

      this.ctx.clearRect(
        0,
        0,
        this.surface!.virtualRect.w,
        this.surface!.virtualRect.h,
      );

      // Cycle through the wheel every 10 seconds
      const kiteHue = (time - this.firstDraw) / 10_000;
      const dartHue = kiteHue + 1/4

      for (const tile of this.displayedTiles) {
        this.ctx.beginPath();
        this.ctx.moveTo(tile.origin.x, tile.origin.y);

        for (const p of tile.vertices.slice(1)) {
          this.ctx.lineTo(p.x, p.y);
        }

        this.ctx.closePath();
        this.ctx.stroke();

        // hard-code saturation at 100% and lightness at 50% for now
        this.ctx.fillStyle = `hsl(${tile.type === TileType.Kite ? kiteHue : dartHue}turn, 100%, 50%)`;
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
