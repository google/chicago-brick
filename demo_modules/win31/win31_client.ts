import {
  ModuleState,
  NumberLerpInterpolator,
  SharedState,
} from "../../client/network/state_manager.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { ModuleWS } from "../../lib/websocket.ts";
import { Client } from "../../client/modules/module_interface.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { State } from "./messages.ts";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => {
      resolve(img);
    });
    img.addEventListener("error", (e) => {
      reject(e.error);
    });
    img.src = src;
  });
}

export function load(
  state: ModuleState,
  network: ModuleWS,
  wallGeometry: Polygon,
) {
  class Win31Client extends Client {
    readonly state: SharedState;
    crashed = false;
    canvas!: CanvasRenderingContext2D;
    img!: HTMLImageElement;
    bsod!: HTMLImageElement;
    constructor() {
      super();

      this.state = state.define("logo", {
        x: NumberLerpInterpolator,
        y: NumberLerpInterpolator,
      });

      network.on("win31:crash", () => {
        this.crashed = true;
      });
    }

    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    async willBeShownSoon(container: HTMLElement) {
      const surface = new CanvasSurface(container, wallGeometry);
      this.surface = surface;
      this.canvas = surface.context;

      this.img = await loadImage("/module/win31/win31.png");
      this.bsod = await loadImage("/module/win31/bsod.png");
    }

    draw(time: number) {
      const surface = this.surface as CanvasSurface;
      if (this.crashed) {
        this.canvas.drawImage(
          this.bsod,
          0,
          0,
          surface.virtualRect.w,
          surface.virtualRect.h,
        );
        return;
      }

      this.canvas.fillStyle = "black";
      this.canvas.fillRect(
        0,
        0,
        surface.virtualRect.w,
        surface.virtualRect.h,
      );

      const logo = this.state.get(time) as State | undefined;
      if (!logo) {
        return;
      }
      // Draw the balls!
      surface.pushOffset();

      this.canvas.drawImage(this.img, logo.x, logo.y);

      surface.popOffset();
    }
  }

  return { client: Win31Client };
}
