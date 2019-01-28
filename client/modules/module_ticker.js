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

define(function(require) {
  'use strict';
  const time = require('client/util/time');
  const debug = require('debug')('wall:module_ticker');
  const error = require('client/util/log').error(debug);
  const monitor = require('client/monitoring/monitor');
  
  // An array of {module:Module, globals:Object}.
  var modulesToDraw = [];

  // Drawing loop.
  var lastTime = 0;
  function draw() {
    var now = time.now();
    var delta = now - lastTime;

    modulesToDraw.forEach(function(pair) {
      try {
        pair.module.draw(now, delta);
      } catch (e) {
        error(e);
      }
    });

    lastTime = now;
    window.requestAnimationFrame(draw);
  }
  window.requestAnimationFrame(draw);

  return {
    add: function(name, module, globals) {
      modulesToDraw.push({name, module, globals});
      debug('Add: We are now drawing ' + modulesToDraw.length + ' modules');
      monitor.markDrawnModules(modulesToDraw.map(m => m.name));
    },
    remove: function(module) {
      modulesToDraw = modulesToDraw.filter(pair => pair.module !== module);
      debug('Remove: We are now drawing ' + modulesToDraw.length + ' modules');
      monitor.markDrawnModules(modulesToDraw.map(m => m.name));
    }
  };
});
