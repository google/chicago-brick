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

var _ = require('underscore');

class ColorsServer extends ServerModuleInterface {
  constructor() {
    super();
    this.nextColorTime = 0;
  }

  tick(time, delta) {
    if (time > this.nextColorTime) {
      this.nextColorTime = time + 1000;
      network.emit('color', {
        color : _.sample([
          'red',
          'green',
          'blue',
          'yellow',
          'pink',
          'violet',
          'orange',
          'cyan'
        ]),
        time : this.nextColorTime
      });
    }
  }
}

class ColorsClient extends ClientModuleInterface {
  constructor() {
    super();
    this.color_ = 'black';
    this.nextColor_ = 'black';
    this.switchTime_ = Infinity;
    
    var self = this;
    network.on('color', function handleColor(data) {
      self.nextColor_ = data.color;
      self.switchTime_ = data.time;
    });
  }

  willBeShownSoon(container) {
    this.surface = new CanvasSurface(container, wallGeometry);
    this.canvas = this.surface.context;
  }

  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
  }

  draw(time, delta) {
    if (time > this.switchTime_) {
      this.color_ = this.nextColor_;
    }
    
    this.canvas.fillStyle = this.color_;
    this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
  }
}

register(ColorsServer, ColorsClient);
