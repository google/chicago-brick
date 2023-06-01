import { Client } from "../../client/modules/module_interface.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import {
  CurrentValueInterpolator,
  ModuleState,
  NumberLerpInterpolator,
  SharedState,
} from "../../client/network/state_manager.ts";
import { MAX_GENS } from "./constants.ts";
import {
  deflateTiles,
  P2TileType,
  PenroseTilesState,
  Tile,
} from "./tile.ts";

type DrawableTileGeneration = Array<{
  path: Path2D;
  type: P2TileType;
}>;

const LINE_WIDTH = 4;

export function load(
  state: ModuleState,
  wallGeometry: Polygon,
) {
  class PenroseTilesClient extends Client {
    ctx!: CanvasRenderingContext2D;
    tilesState?: SharedState;
    generations: DrawableTileGeneration[] = [];

    // Notification that your module has been selected next in the queue.
    willBeShownSoon(
      container: HTMLElement,
      _deadline: number,
    ): Promise<void> | void {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.ctx = (this.surface as CanvasSurface).context;
      this.ctx.lineWidth = LINE_WIDTH;
      this.ctx.lineJoin = "bevel";

      this.tilesState = state.define("tiles", {
        currentGeneration: CurrentValueInterpolator,
        kiteHue: NumberLerpInterpolator,
        dartHue: NumberLerpInterpolator,
      });

      const center = wallGeometry.extents.center();

      let lastGen = Tile.protoTiles(center, wallGeometry.extents.w / 2.5);

      this.generations[0] = this.precomputeTiles(lastGen);

      // Compute the rest of the tiles in the background
      setTimeout(() => {
        for (let i = 1; i < MAX_GENS; ++i) {
          lastGen = deflateTiles(lastGen);
          this.generations[i] = this.precomputeTiles(lastGen);
        }
      });
    }

    private precomputeTiles(
      tiles: readonly Tile[],
    ): DrawableTileGeneration {
      return tiles.filter((t) => {
        // Filter out tiles that aren't visible on this screen
        if (this.surface) {
          return t.extents.intersects(
            this.surface.virtualRect,
          );
        }

        return false;
      }).map((st) => {
        // Precompute paths
        const path = new Path2D();
        path.moveTo(st.points[0].x, st.points[0].y);

        for (const p of st.points.slice(1)) {
          path.lineTo(p.x, p.y);
        }

        path.closePath();

        return {
          path,
          type: st.type,
        };
      });
    }

    draw(time: number, _delta: number) {
      if (!this.surface) {
        return;
      }

      const state = this.tilesState?.get(time) as PenroseTilesState;

      if (!state) {
        return;
      }

      (this.surface as CanvasSurface).pushOffset();

      // hard-code saturation at 80% and lightness at 50% for now
      const kiteFillStyle = `hsl(${state.kiteHue}turn 80% 50%`;
      const dartFillStyle = `hsl(${state.dartHue}turn 80% 50%`;

      for (const tile of this.generations[state.currentGeneration]) {
        this.ctx.fillStyle = tile.type == P2TileType.Kite
          ? kiteFillStyle
          : dartFillStyle;

        console.log(this.ctx.fillStyle);

        this.ctx.stroke(tile.path);
        this.ctx.fill(tile.path);
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
