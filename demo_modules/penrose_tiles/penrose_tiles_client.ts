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
import { P2TileType, PenroseTilesState } from "./tile.ts";
import { Point } from "../../lib/math/vector2d.ts";

type DrawableTile = {
  path: Path2D;
  type: P2TileType;
  center: Point;
}

export function load(
  state: ModuleState,
  wallGeometry: Polygon,
) {
  class PenroseTilesClient extends Client {
    ctx!: CanvasRenderingContext2D;
    tilesState?: SharedState;
    tileGenerations?: DrawableTile[][];

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
        const initState = this.tilesState?.get(0) as PenroseTilesState;

        const tileGens = initState?.tileGenerations;
        
        if (!initState || !tileGens) {
          return;
        }

        this.tileGenerations = [];

        for (const tileGen of tileGens) {
          this.tileGenerations.push(tileGen
            // Filter out tiles that aren't visible on this screen
            .filter(st => {
            if (this.surface) {
              return Rectangle.deserialize(st.extents)?.intersects(this.surface.virtualRect);
            }

            return false;
          // Pre-calculate paths
          }).map(st => {
            const path = new Path2D;
            path.moveTo(st.points[0].x, st.points[0].y);

            for (const p of st.points.slice(1)) {
              path.lineTo(p.x, p.y);
            }

            path.closePath();

            const center = Rectangle.deserialize(st.extents)!.center();

            return {
              path,
              type: st.type,
              center,
            };
          }));
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

      for (const tile of this.tileGenerations[state.currentGeneration]) {
        this.ctx.translate(tile.center.x, tile.center.y);
        this.ctx.fillStyle =  `hsl(${
          tile.type == P2TileType.Kite ? state.kiteHue : state.dartHue
        }turn 100% 50%)`;
        this.ctx.fill(tile.path, 'evenodd');
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
