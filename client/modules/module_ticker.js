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

import * as monitor from '/client/monitoring/monitor.js';
import {easyLog} from '/lib/log.js';
import {now} from '/client/util/time.js';

const log = easyLog('wall:module_ticker');

// An array of modules.
let modulesToDraw = [];

// Drawing loop.
let lastTime = 0;
function draw() {
  const n = now();
  const delta = n - lastTime;

  for (const {module} of modulesToDraw) {
    try {
      module.draw(n, delta);
    } catch (e) {
      log.error(e, {
        module: module.name
      });
    }
  }

  lastTime = n;
  window.requestAnimationFrame(draw);
}
window.requestAnimationFrame(draw);

export function add(name, module) {
  modulesToDraw.push({name, module});
  log.debugAt(1, `Add: We are now drawing ${modulesToDraw.length} modules: ${modulesToDraw.map(({name}) => name).join(', ')}`);
  monitor.markDrawnModules(modulesToDraw.map(m => m.name));
}
export function remove(module) {
  modulesToDraw = modulesToDraw.filter(pair => pair.module !== module);
  log.debugAt(1, `Remove: We are now drawing ${modulesToDraw.length} modules: ${modulesToDraw.map(({name}) => name).join(', ')}`);
  monitor.markDrawnModules(modulesToDraw.map(m => m.name));
}
