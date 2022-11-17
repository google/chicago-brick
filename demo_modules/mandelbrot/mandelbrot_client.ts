import { Client } from "../../client/modules/module_interface.ts";
import { Three, ThreeJsSurface } from "../../client/surface/threejs_surface.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import {
  CurrentValueInterpolator,
  ModuleState,
  SharedState,
} from "../../client/network/state_manager.ts";
import { Destination } from "./messages.ts";
import { PALETTE } from "./palette.ts";

async function loadText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Unable to load ${url}: ${res.statusText}`);
  }
  return await res.text();
}

function toFloat64(x: number): [number, number] {
  const bigPart = Math.fround(x);
  const littlePart = x - bigPart;
  return [bigPart, littlePart];
}

const packedPaletteBuffer = new ArrayBuffer(PALETTE.length * 4);
const packedPalette = new Uint32Array(packedPaletteBuffer, 0, PALETTE.length);
packedPalette.set(PALETTE);

export function load(wallGeometry: Polygon, state: ModuleState) {
  class MandelbrotClient extends Client {
    shader!: Three.ShaderMaterial;
    playlistState: SharedState;
    playlist: Destination[] = [];

    constructor() {
      super();

      this.playlistState = state.define("points", [{
        x: CurrentValueInterpolator,
        y: CurrentValueInterpolator,
        r: CurrentValueInterpolator,
      }]);
    }
    async willBeShownSoon(container: HTMLElement) {
      const surface = new ThreeJsSurface(container, wallGeometry, {});

      const data = new Uint8Array(
        packedPaletteBuffer,
        packedPalette.byteOffset,
        packedPalette.byteLength,
      );
      const texture = new Three.DataTexture(
        data,
        PALETTE.length,
        1,
        Three.RGBAFormat,
        Three.UnsignedByteType,
        Three.UVMapping,
        Three.ClampToEdgeWrapping,
        Three.ClampToEdgeWrapping,
        Three.LinearFilter,
        Three.LinearFilter,
        1,
      );
      texture.needsUpdate = true;

      const vsText = await loadText("/module/mandelbrot/mandelbrot.vs");
      const fsText = await loadText("/module/mandelbrot/mandelbrot.fs");

      this.shader = new Three.ShaderMaterial({
        transparent: false,
        depthWrite: false,
        uniforms: {
          "zoom_center": { value: [0.0, 0.0, 0.0, 0.0] },
          "zoom_dp": { value: [1.0, 1.0] },
          "colorBias": { value: 0.0 },
          "palette": { value: texture },
          "screenOffset": {
            value: [surface.virtualRect.x, surface.virtualRect.y],
          },
          "wallDimension": { value: [surface.wallRect.w, surface.wallRect.h] },
        },
        side: Three.DoubleSide,
        vertexShader: vsText,
        fragmentShader: fsText,
      });

      const rect = new Three.Shape();
      rect.moveTo(0, 0);
      rect.lineTo(surface.virtualRect.w, 0);
      rect.lineTo(surface.virtualRect.w, surface.virtualRect.h);
      rect.lineTo(0, surface.virtualRect.h);
      rect.lineTo(0, 0);
      const geom = new Three.ShapeGeometry([rect]);

      const rectMesh = new Three.Mesh(geom, this.shader);
      rectMesh.frustumCulled = false;

      const camera = new Three.OrthographicCamera(
        0,
        surface.virtualRect.w,
        0,
        surface.virtualRect.h,
        -1,
        1,
      );
      camera.updateProjectionMatrix();
      this.surface = surface;
      surface.camera = camera;
      surface.scene.add(rectMesh);
    }

    draw(time: number) {
      this.playlist = this.playlistState.get(time) as Destination[];
      if (!this.playlist?.length) {
        return;
      }
      const timings = this.playlist.map(({ r }) => {
        return -Math.log(r);
      });

      // Where are we on the playlist so far?
      const accumTime = timings.reduce((acc, timing) => {
        return acc.concat([acc[acc.length - 1] + timing * 2]);
      }, [0]);

      // Current time.
      const loopyTime = (time / 100000) % accumTime[accumTime.length - 1];

      // Current playlist item index.
      const index = accumTime.findLastIndex((a) => a < loopyTime);

      const playlistItem = this.playlist[index];
      const beforeItemAccumTime = accumTime[index];
      const timingItem = timings[index];

      // Are we zooming in or out?
      const timeSinceSwitch = loopyTime - beforeItemAccumTime;
      const zoomIn = timeSinceSwitch < timingItem;

      // Desired zoom at end of playlist item:
      const desiredZoom = 1 / this.playlist[index].r;

      // Initial zoom:
      const initialZoom = 0.5;

      // Current progress through zoom
      const alpha = zoomIn
        ? timeSinceSwitch / timingItem
        : (2 * timingItem - timeSinceSwitch) / timingItem;

      // Ease functions [0,1] -> [0, 1].
      const posEase = 1 - (1 - alpha) ** 8;
      function experp(alpha: number, a: number, b: number) {
        return Math.exp(Math.log(a) + alpha * Math.log(b / a));
      }

      // Current zoom.
      const zoom = experp(alpha, initialZoom, desiredZoom);

      // We need to move slower and slower as we translate.
      const zoomCenterX = playlistItem.x * posEase;
      const zoomCenterY = playlistItem.y * posEase;

      this.shader.uniforms["zoom_center"].value = [
        ...toFloat64(zoomCenterX),
        ...toFloat64(zoomCenterY),
      ];
      this.shader.uniforms["zoom_dp"].value = toFloat64(1 / zoom);
      this.shader.uniforms["colorBias"].value = time / 100.0;

      (this.surface as ThreeJsSurface).render();
    }
  }

  return { client: MandelbrotClient };
}
