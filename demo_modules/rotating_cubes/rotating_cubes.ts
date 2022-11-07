// Rotates some cubes in a fun way.

import { Three, ThreeJsSurface } from "../../client/surface/threejs_surface.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { Client } from "../../client/modules/module_interface.ts";

export function load(wallGeometry: Polygon) {
  class RotatingCubesClient extends Client {
    cubes: Three.Mesh[] = [];
    willBeShownSoon(container: HTMLElement) {
      const surface = new ThreeJsSurface(container, wallGeometry, {});
      this.surface = surface;
      const centerX = this.surface.wallRect.w / 2;
      const centerY = this.surface.wallRect.h / 2;
      let left = this.surface.virtualRect.x - centerX;
      let right = this.surface.virtualRect.x + this.surface.virtualRect.w -
        centerX;
      let top = this.surface.virtualRect.y - centerY;
      let bottom = this.surface.virtualRect.y + this.surface.virtualRect.h -
        centerY;
      const camera = new Three.OrthographicCamera(
        left,
        right,
        top,
        bottom,
        -10000,
        10000,
      );
      surface.camera = camera;
      camera.position.set(50, 50, 50);
      camera.lookAt(new Three.Vector3(0, 0, 0));
      camera.updateMatrix();
      camera.updateProjectionMatrix();

      const material = new Three.ShaderMaterial({
        side: Three.FrontSide,
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = mat3(modelMatrix) * normal;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4( position, 1.0 );
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            gl_FragColor = vec4(
              vNormal.x * vec3(179.0/255.0, 221.0/255.0, 242.0/255.0) +
              vNormal.y * vec3(1, 0, 0) +
              vNormal.z * vec3(1, 1, 1),
              1.0);
          }
        `,
      });

      const SIZE = 200;
      const box = new Three.BoxGeometry(SIZE, SIZE, SIZE);
      box.scale(1, -1, 1);

      // grid is sqrt(2) * 100 in size in the x, and cos(60) that in the y.
      const XGRID = Math.sqrt(2) * SIZE;
      const YGRID = Math.sqrt(3) * XGRID;

      top = Math.ceil(top / -YGRID);
      bottom = Math.floor(bottom / -YGRID);
      left = Math.floor(left / XGRID);
      right = Math.ceil(right / XGRID);

      const makeCube = (i: number, k: number) => {
        const j = -(i + k);
        const object = new Three.Mesh(box, material);
        object.position.set(SIZE * i, SIZE * j, SIZE * k);
        object.updateMatrix();
        surface.scene.add(object);
        this.cubes.push(object);
      };

      for (let row = bottom; row <= top; row++) {
        for (let col = left; col <= right; col++) {
          // Given this position, find i,k
          const i = row + col;
          const k = row - col;
          makeCube(i, k);
          makeCube(i + 1, k);
        }
      }
    }
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }
    draw(time: number) {
      // Inputs time, position.
      // Tell me: which axis should be rotating?
      // Tell me: what is the rotation angle of that cube?
      for (const cube of this.cubes) {
        const distance = cube.position.length();
        // Waves occur roughtly every 1000 units.
        const WAVE_PERIOD = 5000;
        const aDistance = distance % WAVE_PERIOD / WAVE_PERIOD;
        // The wave travels at a specific speed (in units/s)
        const WAVE_SPEED = 800;
        const waveLocation = WAVE_SPEED * time / 1000;
        const aWaveLocation = waveLocation % WAVE_PERIOD / WAVE_PERIOD;

        // Imagine that every wave had an incrementing index assigned to it.
        // That is waveIndex, but we also mod by 6 because we have 6 different
        // types of waves: rotation around each axis xyz and two directions.
        const waveIndex = Math.floor(
          (waveLocation - distance % (6 * WAVE_PERIOD)) / WAVE_PERIOD,
        ) % 6;

        // Pick an axis to rotate around
        const axisIndex = waveIndex % 3;
        const AXES = ["x", "y", "z"];
        const setAxis = (rot: number) => {
          switch (AXES[axisIndex]) {
            case "x":
              cube.rotation.x = rot;
              break;
            case "y":
              cube.rotation.y = rot;
              break;
            case "z":
              cube.rotation.z = rot;
              break;
          }
        };

        // Pick a direction.
        const rotationDirection = waveIndex < 3 ? 1 : -1;

        // Check to see if this cube is within any period of the wave:
        const WAVE_SIZE = 0.2;
        if (
          aDistance < aWaveLocation && aDistance > aWaveLocation - WAVE_SIZE ||
          aDistance < aWaveLocation + 1 &&
            aDistance > 1 + aWaveLocation - WAVE_SIZE
        ) {
          // We are inside of the wave! Let's rotate.
          const aRotation = (aWaveLocation + 1 - aDistance) % 1 / WAVE_SIZE;

          setAxis(rotationDirection * aRotation * Math.PI / 2);
        } else {
          setAxis(0);
        }
      }

      (this.surface as ThreeJsSurface).render();
    }
  }

  return { client: RotatingCubesClient };
}
