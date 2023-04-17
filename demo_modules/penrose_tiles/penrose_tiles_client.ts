// deno-lint-ignore-file no-unused-vars

import { Client } from "../../client/modules/module_interface.ts";
import { ModuleWS } from "../../lib/websocket.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { ModulePeer } from "../../client/network/peer.ts";
import { ModuleState } from "../../client/network/state_manager.ts";
import { PHI, PI_OVER_5, } from "./constants.ts";
import { Tile, TileType, deflateTiles } from "./tile.ts";

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
    readonly protoTiles: Tile[] = [];
    displayedTiles: Tile[] = [];
    currentGeneration = 0;
    previousGenTimeMs = 0;

    // Notification that your module has been selected next in the queue.
    willBeShownSoon(
      container: HTMLElement,
      _deadline: number,
    ): Promise<void> | void {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.ctx = this.surface.context;

      const center = wallGeometry.extents.center();

      for (
        let a = Math.PI / 2 + PI_OVER_5; a < 3 * Math.PI; a += 2 * PI_OVER_5
      ) {
        this.protoTiles.push(
          new Tile(
            center.x,
            center.y,
            a,
            wallGeometry.extents.w / 2.5,
            TileType.Kite,
          ),
        );

        this.displayedTiles = this.protoTiles;
      }
    }

    // Notification that your module has started to fade in.
    beginFadeIn(time: number) {}

    // Notification that your module has finished fading in.
    finishFadeIn() {}

    // Notification that your module should now draw.
    draw(time: number, delta: number) {
      if (this.previousGenTimeMs === 0) {
        this.previousGenTimeMs = time;
      }

      if (this.currentGeneration < 7 && time - this.previousGenTimeMs >= 10000) {
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

      // TODO(aarestad): make this clearer what we are doing
      const dist = [[PHI, PHI, PHI], [-PHI, -1, -PHI]];

      for (const tile of this.displayedTiles) {
        let angle = tile.angle - PI_OVER_5;
        this.ctx.beginPath();
        this.ctx.moveTo(tile.x, tile.y);

        const ord = tile.type;

        for (let i = 0; i < 3; i++) {
          const x = tile.x + dist[ord][i] * tile.size * Math.cos(angle);
          const y = tile.y - dist[ord][i] * tile.size * Math.sin(angle);
          this.ctx.lineTo(x, y);
          angle += PI_OVER_5;
        }

        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.fillStyle = ord === 0 ? "orange" : "yellow";
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
