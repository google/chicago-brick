import { P5Surface } from "../../client/surface/p5_surface.ts";
import { sub } from "../../lib/math/vector2d.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { WS } from "../../lib/websocket.ts";
import { Client } from "../../client/modules/module_interface.ts";
import { p5InstanceExtensions } from "https://cdn.skypack.dev/-/p5@v1.5.0-vdxCwBHiO9HdwpI4VobF/dist=es2019,mode=types/index.d.ts";
import { Logger } from "../../lib/log.ts";
import { TiffanyPoint, TiffanyPolygon } from "./types.ts";

// These control the thickness of the lines that are drawn, and are
// determined by taking the log10 of the number of underlying image pixels
// inside the polygon and making sure the result is in this range.
const MAX_LINE_WIDTH = 10;
const MIN_LINE_WIDTH = 1;
const AREA_LOG_BASE = 4;

export function load(wallGeometry: Polygon, debug: Logger, network: WS) {
  function calculateProgress(polygon: TiffanyPolygon, t: number) {
    const start = polygon.attrs.addedAt;
    const end = polygon.attrs.completeAt;
    return Math.max(0, Math.min(1, (t - start) / (end - start)));
  }

  class TiffanySketch {
    constructor(
      readonly p5: p5InstanceExtensions,
      readonly surface: P5Surface,
    ) {
    }

    preload() {
    }

    setup() {
    }

    draw(t: number, polygons: TiffanyPolygon[]) {
      if (!polygons) {
        return;
      }

      this.p5.strokeJoin(this.p5.BEVEL);
      this.p5.stroke(this.p5.color(0, 0, 0));
      this.p5.strokeWeight(3);
      for (const polygon of polygons) {
        const start = polygon.attrs.addedAt;
        const end = polygon.attrs.completeAt;
        const progress = calculateProgress(polygon, t);

        // Don't draw panes that have been replaced
        // (i.e. they have been completely superceded).
        const replacedAt = polygon.attrs.replacedAt;
        if (replacedAt && t >= replacedAt) {
          continue;
        }

        // Don't draw panes that aren't set to appear yet.
        if (t < start) {
          continue;
        }

        // Don't re-draw completed polygons.
        if (t > end) {
          continue;
        }

        // Linear fade from old to new color, and also opacity so we transition
        // nicely when restarting.
        const oldColor = polygon.attrs.parentColor!;
        const color = polygon.attrs.color!;
        const r = oldColor.r + (color.r - oldColor.r) * progress;
        const g = oldColor.g + (color.g - oldColor.g) * progress;
        const b = oldColor.b + (color.b - oldColor.b) * progress;
        this.p5.fill(this.p5.color(r, g, b, 255 * progress));

        let weight = Math.log(Math.max(1, polygon.attrs.stddev!.n)) /
          Math.log(AREA_LOG_BASE);
        weight = Math.min(MAX_LINE_WIDTH, weight);
        weight = Math.max(MIN_LINE_WIDTH, weight);

        if (t >= end) {
          this.p5.stroke(this.p5.color(0, 0, 0));
          this.p5.strokeWeight(weight);
        } else {
          this.p5.noStroke();
        }
        this.p5.beginShape();
        for (const p of polygon.points) {
          this.p5.vertex(p.x, p.y);
        }
        this.p5.endShape(this.p5.CLOSE);

        if (t < end) {
          // Draw the borders in transition
          this.p5.stroke(this.p5.color(0, 0, 0));
          this.p5.strokeWeight(weight);
          const poly = new TiffanyPolygon(polygon.points);

          for (
            const [p1, p2] of poly.pairs() as Iterable<
              [TiffanyPoint, TiffanyPoint]
            >
          ) {
            if (!p1.newPt && !p2.newPt) {
              this.p5.line(p1.x, p1.y, p2.x, p2.y);
            } else if (p1.newPt != p2.newPt) { // poor-man's XOR operator
              const startPt = p1.newPt ? p2 : p1;
              const endPt = p1.newPt ? p1 : p2;
              const delta = sub(endPt, startPt);
              this.p5.line(
                startPt.x,
                startPt.y,
                startPt.x + progress * delta.x,
                startPt.y + progress * delta.y,
              );
            } else {
              const p1dx = (p2.x - p1.x) / 2;
              const p1dy = (p2.y - p1.y) / 2;
              const p2dx = p1dx * -1;
              const p2dy = p1dy * -1;
              this.p5.line(
                p1.x,
                p1.y,
                p1.x + progress * p1dx,
                p1.y + progress * p1dy,
              );
              this.p5.line(
                p2.x,
                p2.y,
                p2.x + progress * p2dx,
                p2.y + progress * p2dy,
              );
            }
          }
        }
      }
    }
  }

  class TiffanyClient extends Client {
    surface: P5Surface | undefined = undefined;
    // Polygons that have been received from the server
    polygons: TiffanyPolygon[] = [];
    constructor() {
      super();
      debug("Tiffany Stained Glass Client!");

      network.on("polygons", (data) => {
        this.polygons = data.polygons;
      });
    }

    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    willBeShownSoon(container: HTMLElement, deadline: number) {
      this.surface = new P5Surface(
        container,
        wallGeometry,
        TiffanySketch,
        deadline,
      );
    }

    draw(time: number) {
      this.surface?.p5.draw(time, this.polygons);
    }
  }

  return { client: TiffanyClient };
}
