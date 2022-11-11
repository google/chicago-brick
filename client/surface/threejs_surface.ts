/* Copyright 2019 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import { Surface } from "./surface.ts";
import * as Three from "https://esm.sh/three@0.145.0";
import { Polygon } from "../../lib/math/polygon2d.ts";

export class ThreeJsSurface extends Surface {
  renderer: Three.WebGLRenderer;
  camera: Three.Camera;
  scene: Three.Scene;

  constructor(
    container: HTMLElement,
    wallGeometry: Polygon,
    properties: Three.WebGLRendererParameters,
  ) {
    super(container, wallGeometry);
    this.renderer = new Three.WebGLRenderer(properties);
    this.renderer.setSize(
      container.offsetWidth,
      container.offsetHeight,
    );
    container.appendChild(this.renderer.domElement);

    const camera = new Three.PerspectiveCamera(
      45,
      this.wallRect.w / this.wallRect.h,
      0.1,
      1000,
    );
    this.camera = camera;
    this.scene = new Three.Scene();

    camera.setViewOffset(
      this.wallRect.w,
      this.wallRect.h,
      this.virtualRect.x,
      this.virtualRect.y,
      this.virtualRect.w,
      this.virtualRect.h,
    );
  }
  setTileViewOffsetForCamera(camera: Three.PerspectiveCamera) {
    const cam = camera || this.camera;
    cam.setViewOffset(
      this.wallRect.w,
      this.wallRect.h,
      this.virtualRect.x,
      this.virtualRect.y,
      this.virtualRect.w,
      this.virtualRect.h,
    );
  }
  destroy() {
    this.renderer.dispose();
  }
  setOpacity(alpha: number) {
    this.renderer.domElement.style.opacity = String(alpha);
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  takeSnapshot() {
    this.render();
    const context = this.renderer.getContext();
    const data = new Uint8Array(
      context.drawingBufferWidth * context.drawingBufferHeight * 4,
    );
    context.readPixels(
      0,
      0,
      context.drawingBufferWidth,
      context.drawingBufferHeight,
      context.RGBA,
      context.UNSIGNED_BYTE,
      data,
    );
    const clampedData = new Uint8ClampedArray(data.buffer);
    return new ImageData(
      clampedData,
      context.drawingBufferWidth,
      context.drawingBufferHeight,
    );
  }
}

export { Three };
