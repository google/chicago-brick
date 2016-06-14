/* Copyright 2015 Google Inc. All Rights Reserved.

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

const ModuleInterface = require('lib/module_interface');

class ThreeJsTestServer extends ModuleInterface.Server {}

class ThreeJsTestClient extends ModuleInterface.Client {
  constructor(config, services) {
    this.wallGeometry = services.locate('wallGeometry');
  }
  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
  }

  willBeShownSoon(container, deadline) {
    const THREE = require('three');
    this.startTime = deadline;
    const ThreeJsSurface = require('client/surface/threejs_surface');
    this.surface = new ThreeJsSurface(container, this.wallGeometry);

    var geometry = new THREE.BoxGeometry(3, 3, 3);
    var material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.cube = new THREE.Mesh(geometry, material);
    this.surface.scene.add(this.cube);

    this.surface.camera.position.set(0, 0, 5);
    this.surface.camera.updateProjectionMatrix();
  }

  draw(time, delta) {
    this.cube.rotation.x = time / 1000;
    this.cube.rotation.y = time * 1.1 / 1000;
    this.surface.render();
  }
}

register(ThreeJsTestServer, ThreeJsTestClient);
