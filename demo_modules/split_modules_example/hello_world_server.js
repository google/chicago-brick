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

register(HelloWorldServer, null);
