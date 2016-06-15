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

class SharedTestServer extends ModuleInterface.Server {}
const wallGeometry = require('wallGeometry');
const state = require('state');

class SharedTestClient extends ModuleInterface.Client {
  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    } 
  }

  willBeShownSoon(container, deadline) {
    const CanvasSurface = require('client/surface/canvas_surface');
    this.surface = new CanvasSurface(container, wallGeometry);
    this.canvas = this.surface.context;
    this.clientId = 'client' + this.surface.virtualRect.x + this.surface.virtualRect.y;
    state.create(this.clientId, 'ValueNearestInterpolator');
  }

  draw(time, delta) {
    // Clear the screen.
    this.canvas.fillStyle = 'black';
    this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    
    state.get(this.clientId).set(time, time);

    this.canvas.fillStyle = this.color || 'white';
    this.canvas.textAlign = 'center';
    var fontHeight = Math.floor(this.surface.virtualRect.h / 10);
    this.canvas.font = fontHeight + 'px Helvetica';
    this.canvas.textBaseline = 'middle';
    this.canvas.fillText('Time: ' + time.toFixed(1), this.surface.virtualRect.w / 2, this.surface.virtualRect.h / 2);
    var idx = 1;
    for (var name in state.trackedState_) {
      if (name.startsWith('client') && state.trackedState_[name].get(time - 100)) {
        this.canvas.fillText(name + ': ' + state.trackedState_[name].get(time - 100).toFixed(1), this.surface.virtualRect.w / 2, this.surface.virtualRect.h / 2 + fontHeight * idx);
        idx++;
      }
    }
  }
}

register(SharedTestServer, SharedTestClient);

