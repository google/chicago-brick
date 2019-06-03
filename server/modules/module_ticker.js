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

import {now} from '../util/time.js';
import Debug from 'debug';
const debug = Debug('wall:module_ticker');

// An array of RunningModule objects (see server_state_machine).
var modulesToTick = [];

// Ticking loop.
var lastTime = 0;
var interval = 1000.0 / 10.0;  // 10 FPS

function tick() {
  var start = now();
  modulesToTick.forEach((module) => module.tick(start, start - lastTime));
  lastTime = start;

  // Set timeout for remaining tick time, or immediately if the module went
  // over.
  var tickTime = now() - start;
  if (tickTime > interval) {
    debug('Module tick() took too long: ' + tickTime + 'ms out of ' +
          interval + 'ms.');
  }
  setTimeout(tick, Math.max(interval - tickTime, 0));
}
tick();

export function add(module, globals) {
  if (module.instance) {
    modulesToTick.push(module);
    debug(
        'Add: We are now ticking ' + modulesToTick.length + ' modules:',
        modulesToTick.map((m) => m.moduleDef.name).join(', '));
    if (modulesToTick.length > 2) {
      debug('FAILED!');
    }
  }
}
export function remove(module) {
  modulesToTick = modulesToTick.filter(m => {
    if (m === module) {
      m.dispose();
      return false;
    }
    return true;
  });
  debug('Remove: We are now ticking ' + modulesToTick.length + ' modules',
      modulesToTick.map((m) => m.moduleDef.name).join(', '));
}
