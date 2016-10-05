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

'use strict';
var time = require('server/util/time');
var debug = require('debug')('wall:module_ticker');

// An array of RunningModule objects (see server_state_machine).
var modulesToTick = [];

// Ticking loop.
var lastTime = 0;
var interval = 1000.0 / 10.0;  // 10 FPS

function tick() {
  var start = time.now();
  modulesToTick.forEach((module) => module.tick(start, start - lastTime));
  lastTime = start;

  // Set timeout for remaining tick time, or immediately if the module went
  // over.
  var tickTime = time.now() - start;
  if (tickTime > interval) {
    debug('Module tick() took too long: ' + tickTime + 'ms out of ' +
          interval + 'ms.');
  }
  setTimeout(tick, Math.max(interval - tickTime, 0));
}
tick();

module.exports = {
  add: function(module, globals) {
    modulesToTick.push(module);
    debug(
        'Add: We are now ticking ' + modulesToTick.length + ' modules:',
        modulesToTick.map((m) => m.moduleDef.name).join(', '));
  },
  remove: function(module) {
    modulesToTick = modulesToTick.filter(m => {
      if (m === module) {
        m.dispose();
        return false;
      }
      return true;
    })
    debug('Remove: We are now ticking ' + modulesToTick.length + ' modules');
  }
};
