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

/**
 * The ModuleDef class contains all the information necessary to load &
 * instantiate a module, including code location and config parameters.
 */
export class ModuleDef {
  constructor(name, moduleRoot, paths, baseName, config, credit, testonly) {
    this.name = name;
    this.root = moduleRoot;

    // The path to the client main file of the module.
    this.clientPath = paths.client;

    // The path to the server main file of the module.
    this.serverPath = paths.server;

    // The name of the base module, or falsey otherwise.
    this.baseName = baseName;

    // The config object.
    this.config = config;

    // The credits object.
    this.credit = credit;

    // True if this module should be excluded from all auto-generated
    // collections.
    this.testonly = testonly;
  }
}

export class EmptyModuleDef extends ModuleDef {
  constructor() {
    super('_empty', '', {
      client: '',
      server: '',
    }, '', {}, {}, true);
    // TODO(applmak): ^ this hacky.
  }
}
