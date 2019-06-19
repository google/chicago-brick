/* Copyright 2018 Google Inc. All Rights Reserved.

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

import {Surface} from '/client/surface/surface.js';
import * as Three from '/sys/three-full/builds/Three.es.js';

export class ThreeJsSurface extends Surface {
  constructor(container, wallGeometry, properties) {
    super(container, wallGeometry);
    this.renderer = new Three.WebGLRenderer(properties);
    this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new Three.PerspectiveCamera(45, this.wallRect.w / this.wallRect.h, 0.1, 1000);
    this.scene = new Three.Scene;

    this.camera.setViewOffset(
        this.wallRect.w, this.wallRect.h,
        this.virtualRect.x, this.virtualRect.y,
        this.virtualRect.w, this.virtualRect.h);
  }
  setTileViewOffsetForCamera(camera) {
    var cam = camera || this.camera;
    cam.setViewOffset(
        this.wallRect.w, this.wallRect.h,
        this.virtualRect.x, this.virtualRect.y,
        this.virtualRect.w, this.virtualRect.h);
  }
  destroy() {
    this.renderer.dispose();
    this.renderer = null;
    this.camera = null;
    this.scene = null;
  }
  setOpacity(alpha) {
    this.renderer.domElement.style.opacity = alpha;
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  takeSnapshot() {
    this.render();
    const context = this.renderer.context;
    const data = new Uint8Array(context.drawingBufferWidth * context.drawingBufferHeight * 4);
    context.readPixels(0, 0, context.drawingBufferWidth, context.drawingBufferHeight,
        context.RGBA, context.UNSIGNED_BYTE, data);
    const clampedData = new Uint8ClampedArray(data.buffer);
    return new ImageData(clampedData, context.drawingBufferWidth, context.drawingBufferHeight);
  }
}
