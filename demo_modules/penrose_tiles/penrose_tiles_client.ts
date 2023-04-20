import { Client } from "../../client/modules/module_interface.ts";
import { ModuleWS } from "../../lib/websocket.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { ModulePeer } from "../../client/network/peer.ts";
import { ModuleState, NumberLerpInterpolator, SharedState, ValueNearestInterpolator } from "../../client/network/state_manager.ts";
import { Tile, P2TileType, SerializedTile } from "./tile.ts";

export function load(
  network: ModuleWS,
  peerNetwork: ModulePeer,
  state: ModuleState,
  wallGeometry: Polygon,
) {
  class PenroseTilesClient extends Client {
    ctx!: CanvasRenderingContext2D;
    tilesState?: SharedState;

    // Notification that your module has been selected next in the queue.
    willBeShownSoon(
      container: HTMLElement,
      _deadline: number,
    ): Promise<void> | void {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.ctx = (this.surface as CanvasSurface).context;

      this.tilesState = state.define("tiles", [{
         points: ValueNearestInterpolator,
         angle: ValueNearestInterpolator,
         size: ValueNearestInterpolator,
         type: ValueNearestInterpolator,
         color: NumberLerpInterpolator,
      }]);
    }

    // Notification that your module has started to fade in.
    beginFadeIn(_time: number) {}

    // Notification that your module has finished fading in.
    finishFadeIn() {}

    // Notification that your module should now draw.
    draw(time: number, _delta: number) {
      const serTiles = this.tilesState!.get(time) as SerializedTile[] | undefined;
      if (!serTiles) {
        return;
      }

      (this.surface as CanvasSurface).pushOffset();

      for (const serTile of serTiles) {
        const tile = Tile.deserialize(serTile);

        this.ctx.beginPath();
        this.ctx.moveTo(tile.points[0].x, tile.points[0].y);

        for (const p of tile.points.slice(1)) {
          this.ctx.lineTo(p.x, p.y);
        }

        this.ctx.closePath();
        this.ctx.stroke();

        // hard-code saturation at 100% and lightness at 50% for now
        this.ctx.fillStyle = `hsl(${
          serTile.hue
        }turn 100% 50%)`;

        this.ctx.fill();
      }

      (this.surface as CanvasSurface).popOffset();
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

  return { client: PenroseTilesClient };
}
