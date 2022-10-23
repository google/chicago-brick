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

import { Client } from "/client/modules/module_interface.ts";

export function load(network) {
  // This is a no-op module that shows what is leaking in the framework when we
  // switch modules.
  class MemoryDebugClient extends Client {
    constructor() {
      super();
      // TODO(applmak): Send something this message, maybe?
      const memoryDebugHandler = () => {
        this.thing = (this.thing || 0) + 1;
      };
      network.on('_memory_debug', memoryDebugHandler);
    }

    async willBeShownSoon(container) {
      container.style.backgroundColor = 'black';
    }
  }

  return {client: MemoryDebugClient};
}
