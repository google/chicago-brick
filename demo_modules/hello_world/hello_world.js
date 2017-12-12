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

const register = require('register');
const ModuleInterface = require('lib/module_interface');
const _ = require('underscore');
const debug = require('debug');
const network = require('network');

class HelloWorldServer extends ModuleInterface.Server {
  constructor(config) {
    super();
    debug('Hello, world!', config);
    this.nextcolorTime = 0;
  }

  tick(time, delta) {
    // If there's no moment to switch colors defined, pick such a moment,
    // broadcast to clients.
    if (!this.nextColorTime) {
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
      debug('choose color', this.nextColorTime);
      Promise.delay(1100).then((function() { this.nextColorTime = 0; }).bind(this));
    }
  }
}

class HelloWorldClient extends ModuleInterface.Client {
  constructor(config) {
    super();
    
    debug('Hello, world!', config);
    this.color = config.color;
    this.nextColor = null;
    this.nextColorTime = 0;
    this.image = null;
    this.surface = null;

    var client = this;
    network.on('color', function handleColor(data) {
      debug('handle color', data);
      client.nextColor = data.color;
      client.nextColorTime = data.time;
    });
  }

  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    } 
  }

  willBeShownSoon(container, deadline) {
    const asset = require('client/asset/asset');
    
    this.startTime = deadline;
    const CanvasSurface = require('client/surface/canvas_surface');
    const wallGeometry = require('wallGeometry');
    this.surface = new CanvasSurface(container, wallGeometry);
    this.canvas = this.surface.context;

    // Load the image asset.
    var self = this;
    return new Promise(function(resolve, reject) {
      self.image = new Image;
      self.image.onload = resolve;
      self.image.src = asset('fractal.gif');
    });
  }

  draw(time, delta) {
    if (this.nextColorTime && this.nextColorTime < time) {
      this.color = this.nextColor;
      this.nextColorTime = 0;
    }

    this.canvas.fillStyle = 'black';
    this.canvas.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);

    this.canvas.fillStyle = 'white';

    this.surface.pushOffset();
    var x = Math.cos(time * Math.PI / 2000) * 100;
    var y = Math.sin(time * Math.PI / 2000) * 100;
    var cx = this.surface.wallRect.w / 2;
    var cy = this.surface.wallRect.h / 2;

    this.canvas.drawImage(this.image, cx + x - 50, cy + y - 50, 100, 100);

    this.surface.popOffset();

    this.canvas.fillStyle = this.color || 'white';
    this.canvas.textAlign = 'center';
    var fontHeight = Math.floor(this.surface.virtualRect.h / 10);
    this.canvas.font = fontHeight + 'px Helvetica';
    this.canvas.textBaseline = 'middle';
    this.canvas.fillText('Time: ' + time.toFixed(1), this.surface.virtualRect.w / 2, this.surface.virtualRect.h / 2);
  }
}

register(HelloWorldServer, HelloWorldClient);
