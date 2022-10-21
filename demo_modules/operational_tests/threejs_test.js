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

import * as Three from "https://esm.sh/three@0.145.0";
import {ThreeJsSurface} from '../../client/surface/threejs_surface.ts';
import { Client } from '../../lib/module_interface.ts'; 

export function load(wallGeometry) {
  class ThreeJsTestClient extends Client {
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    async willBeShownSoon(container, deadline) {
      this.startTime = deadline;
      this.surface = new ThreeJsSurface(container, wallGeometry);

      var geometry = new Three.BoxGeometry(3, 3, 3);
      var material = new Three.MeshBasicMaterial({ color: 0x00ff00 });
      this.cube = new Three.Mesh(geometry, material);
      this.surface.scene.add(this.cube);

      this.surface.camera.position.set(0, 0, 5);
      this.surface.camera.updateProjectionMatrix();
    }

    draw(time) {
      this.cube.rotation.x = time / 1000;
      this.cube.rotation.y = time * 1.1 / 1000;
      this.surface.render();
    }
  }

  return {client: ThreeJsTestClient};
}
