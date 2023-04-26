import { Client } from "../../client/modules/module_interface.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import {
  CurrentValueInterpolator,
  ModuleState,
  NumberLerpInterpolator,
  SharedState,
} from "../../client/network/state_manager.ts";
import { P2TileType, PenroseTilesState, TileGenerations } from "./tile.ts";

export function load(
  state: ModuleState,
  wallGeometry: Polygon,
) {
  class PenroseTilesClient extends Client {
    ctx!: CanvasRenderingContext2D;
    tilesState?: SharedState;
    tileGenerations?: TileGenerations;

    // Notification that your module has been selected next in the queue.
    willBeShownSoon(
      container: HTMLElement,
      _deadline: number,
    ): Promise<void> | void {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.ctx = (this.surface as CanvasSurface).context;

      this.tilesState = state.define("tiles", {
        currentGeneration: CurrentValueInterpolator,
        tileGenerations: [[
          {
            points: CurrentValueInterpolator,
            angle: CurrentValueInterpolator,
            size: CurrentValueInterpolator,
            type: CurrentValueInterpolator,
            extents: CurrentValueInterpolator,
          },
        ]],
        kiteHue: NumberLerpInterpolator,
        dartHue: NumberLerpInterpolator,
      });
    }

    beginFadeIn(_time: number) {}

    finishFadeIn() {}

    draw(time: number, _delta: number) {
      if (!this.tileGenerations) {
        this.tileGenerations = (this.tilesState?.get(0) as PenroseTilesState)
          ?.tileGenerations;

        if (!this.tileGenerations) {
          return;
        }

        // Filter out tiles that aren't visible on this screen
        for (let i = 0; i < this.tileGenerations.length; ++i) {
          this.tileGenerations[i] = this.tileGenerations[i].filter(st => {
            if (this.surface) {
              return Rectangle.deserialize(st.extents)?.intersects(this.surface.virtualRect);
            }

            return false;
          });
        }
      }

      if (!this.surface) {
        return;
      }

      (this.surface as CanvasSurface).pushOffset();

      const state = this.tilesState?.get(time) as PenroseTilesState;

      if (!state) {
        return;
      }

      this.ctx.lineWidth = 8;

      // hard-code saturation at 100% and lightness at 50% for now
      const kiteFillStyle = `hsl(${state.kiteHue}turn 100% 50%`;
      const dartFillStyle = `hsl(${state.dartHue}turn 100% 50%`;

      for (const tile of this.tileGenerations[state.currentGeneration]) {
        const path = new Path2D;
        path.moveTo(tile.points[0].x, tile.points[0].y);

        for (const p of tile.points.slice(1)) {
          path.lineTo(p.x, p.y);
        }

        path.closePath();

        this.ctx.fillStyle = tile.type == P2TileType.Kite ? kiteFillStyle : dartFillStyle;

        this.ctx.stroke(path);
        this.ctx.fill(path);
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
