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

const register = require('register');
const ModuleInterface = require('lib/module_interface');
const network = require('network');

// This is a no-op module that shows what is leaking in the framework when we
// switch modules.
class MemoryDebugServer extends ModuleInterface.Server {}

class MemoryDebugClient extends ModuleInterface.Client {
  constructor(config) {
    super();
    // TODO(applmak): Send something this message, maybe?
    var client = this;
    network.on('_memory_debug', function memoryDebugHandler() {
      client.thing = (client.thing || 0) + 1;
    });
  }

  willBeShownSoon(container) {
    container.style.backgroundColor = 'black';
  }
}

register(MemoryDebugServer, MemoryDebugClient);
