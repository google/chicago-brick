import { Client } from "../../client/modules/module_interface.ts";
import { ModuleWS } from "../../lib/websocket.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { ModulePeer } from "../../client/network/peer.ts";
import { ModuleState, ValueNearestInterpolator, NumberLerpInterpolator, SharedState } from "../../client/network/state_manager.ts";
import { Tile, P2TileType, PenroseTilesState } from "./tile.ts";

export function load(
  network: ModuleWS,
  peerNetwork: ModulePeer,
  state: ModuleState,
  wallGeometry: Polygon,
) {
  class PenroseTilesClient extends Client {
    ctx!: CanvasRenderingContext2D;
    tilesState?: SharedState;
    displayedTiles?: Tile[];

    // Notification that your module has been selected next in the queue.
    willBeShownSoon(
      container: HTMLElement,
      _deadline: number,
    ): Promise<void> | void {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.ctx = (this.surface as CanvasSurface).context;

      this.tilesState = state.define("tiles", {
        newTiles: [{
          points: ValueNearestInterpolator,
          angle: ValueNearestInterpolator,
          size: ValueNearestInterpolator,
          type: ValueNearestInterpolator,
       }],
       kiteHue: NumberLerpInterpolator,
       dartHue: NumberLerpInterpolator,
      });
    }

    // Notification that your module has started to fade in.
    beginFadeIn(_time: number) {}

    // Notification that your module has finished fading in.
    finishFadeIn() {}

    // Notification that your module should now draw.
    draw(time: number, _delta: number) {
      const state = this.tilesState!.get(time) as PenroseTilesState;
      if (!state) {
        return;
      }


      if (state.newTiles.length) {
        this.displayedTiles = state.newTiles.map(t => Tile.deserialize(t));
      }

      if (!this.displayedTiles) {
        console.log("no tiles to draw :(");
        return;
      }

      (this.surface as CanvasSurface).pushOffset();

      for (const tile of this.displayedTiles) {
        this.ctx.beginPath();
        this.ctx.moveTo(tile.points[0].x, tile.points[0].y);

        for (const p of tile.points.slice(1)) {
          this.ctx.lineTo(p.x, p.y);
        }

        this.ctx.closePath();
        this.ctx.stroke();

        // hard-code saturation at 100% and lightness at 50% for now
        this.ctx.fillStyle = `hsl(${
          tile.type == P2TileType.Kite ? state.kiteHue : state.dartHue
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
