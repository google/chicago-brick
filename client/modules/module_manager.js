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

define(function(require) {
  'use strict';

  const ClientModule = require('client/modules/module');
  const ClientStateMachine = require('client/modules/client_state_machine');
  const libraries = require('client/util/libraries');
  const network = require('client/network/network');
  const timeManager = require('client/util/time');

  class ModuleManager {
    constructor() {
      // The state machine.
      this.stateMachine = new ClientStateMachine;
    }
    start() {
      timeManager.start();

      // Server has asked us to load a new module.
      network.on('loadModule', (bits) => {
        const module = ClientModule.deserialize(bits);

        // Load any client libraries that are not already loaded.
        if (module.libs) {
          _.each(module.libs, (lib) => {
            libraries.load(lib);
          });
        }

        this.stateMachine.playModule(module);
      });
    }
  }

  return ModuleManager;
});
