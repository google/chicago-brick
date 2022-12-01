import { Polygon } from "../../lib/math/polygon2d.ts";
import { Client } from "../../client/modules/module_interface.ts";
import { Three, ThreeJsSurface } from "../../client/surface/threejs_surface.ts";
import { ModuleWS } from "../../lib/websocket.ts";
import { MAX_NEW_STARS, Star, V } from "./interfaces.ts";
import { easyLog } from "../../lib/log.ts";

const log = easyLog("stars");

async function loadText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Unable to load ${url}: ${res.statusText}`);
  }
  return await res.text();
}

export function load(network: ModuleWS, wallGeometry: Polygon) {
  class StarsClient extends Client {
    positions!: Float32Array;
    startTimes!: Float32Array;
    starMat!: Three.ShaderMaterial;
    mesh!: Three.Mesh<Three.BufferGeometry, Three.ShaderMaterial>;
    starGeo!: Three.BufferGeometry;

    needUpdate = false;

    stars: Star[] = [];
    warpFactor = 1.0;
    numStars = 1;

    updateStar(star: Star) {
      this.stars[star.index] = star;
    }
    async willBeShownSoon(container: HTMLElement, _deadline: number) {
      network.on("stars:new-star", (stars) => {
        // log(`Got ${stars.length} new stars`);
        for (const star of stars) {
          this.updateStar(star);
          this.numStars = Math.max(this.numStars, star.index + 1);
        }
      });
      network.on("stars:set-warp", (factor) => {
        log(`Warp factor ${factor}`);
        this.warpFactor = factor;
        this.starMat.uniforms["V"].value = V * factor;
      });

      const surface = new ThreeJsSurface(container, wallGeometry, {});
      this.surface = surface;

      this.positions = new Float32Array(6 * 3 * MAX_NEW_STARS);
      this.startTimes = new Float32Array(6 * MAX_NEW_STARS);

      this.starGeo = new Three.BufferGeometry();
      this.starGeo.setAttribute(
        "position",
        new Three.BufferAttribute(this.positions, 3).setUsage(
          Three.StreamDrawUsage,
        ),
      );
      this.starGeo.setAttribute(
        "startTime",
        new Three.BufferAttribute(
          this.startTimes,
          1,
        ).setUsage(Three.StreamDrawUsage),
      );

      const vsText = await loadText("/module/stars/stars.vs");
      const fsText = await loadText("/module/stars/stars.fs");

      this.starMat = new Three.ShaderMaterial({
        transparent: false,
        depthWrite: false,
        uniforms: {
          "time": { value: 0 },
        },
        side: Three.DoubleSide,
        vertexShader: vsText,
        fragmentShader: fsText,
        blending: Three.AdditiveBlending,
      });

      this.mesh = new Three.Mesh(this.starGeo, this.starMat);
      this.mesh.frustumCulled = false;

      surface.scene.add(this.mesh);
    }
    draw(time: number): void {
      const surface = this.surface as ThreeJsSurface;

      for (const star of this.stars) {
        if (!star) {
          continue;
        }
        const { x, y, z, index, spawnTime, size } = star;

        // 2 triangles forming a quad: 6 points in TRIANGLES draw mode.
        // We need to rotate the quads so that their normal is pointed toward the center of the screen.
        const startZ = z + V * this.warpFactor * (time - spawnTime);
        const endZ = startZ + 40 * V * this.warpFactor;

        // When the point is at (x, 0), we should not rotate.
        // Otherwise, we need to rotate our quad by Math.atan2(y, x).
        const angle = Math.atan2(y, x);
        const dx = -Math.sin(angle) * size / 2;
        const dy = Math.cos(angle) * size / 2;

        // Point 0
        this.positions[18 * index + 0] = x + dx;
        this.positions[18 * index + 1] = y + dy;
        this.positions[18 * index + 2] = startZ;
        // Point 1
        this.positions[18 * index + 3] = x - dx;
        this.positions[18 * index + 4] = y - dy;
        this.positions[18 * index + 5] = startZ;
        // Point 2
        this.positions[18 * index + 6] = x - dx;
        this.positions[18 * index + 7] = y - dy;
        this.positions[18 * index + 8] = endZ;
        // Point 2 again
        this.positions[18 * index + 9] = x - dx;
        this.positions[18 * index + 10] = y - dy;
        this.positions[18 * index + 11] = endZ;
        // Point 3
        this.positions[18 * index + 12] = x + dx;
        this.positions[18 * index + 13] = y + dy;
        this.positions[18 * index + 14] = endZ;
        // Point 0 again
        this.positions[18 * index + 15] = x + dx;
        this.positions[18 * index + 16] = y + dy;
        this.positions[18 * index + 17] = startZ;

        this.startTimes[6 * index + 0] = spawnTime;
        this.startTimes[6 * index + 1] = spawnTime;
        this.startTimes[6 * index + 2] = spawnTime;
        this.startTimes[6 * index + 3] = spawnTime;
        this.startTimes[6 * index + 4] = spawnTime;
        this.startTimes[6 * index + 5] = spawnTime;
      }

      this.starGeo.setDrawRange(0, this.numStars * 6);

      this.mesh.geometry.attributes["position"].needsUpdate = true;
      this.mesh.geometry.attributes["startTime"].needsUpdate = true;

      this.starMat.uniforms["time"].value = time;
      surface.render();
    }
  }

  return { client: StarsClient };
}
