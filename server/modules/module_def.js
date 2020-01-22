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

import EventEmitter from 'events';
import path from 'path';

import assert from '../../lib/assert.js';
import {easyLog} from '../../lib/log.js';
import conform from '../../lib/conform.js';
import inject from '../../lib/inject.js';
import * as wallGeometry from '../util/wall_geometry.js';
import {Server} from '../../lib/module_interface.js';

/**
 * The ModuleDef class contains all the information necessary to load &
 * instantiate a module, including code location and config parameters.
 */
export class ModuleDef extends EventEmitter {
  constructor(name, moduleRoot, paths, baseName, config, credit, testonly) {
    super();
    this.name = name;
    this.root = moduleRoot;
    this.config = config;
    this.credit = credit;
    this.testonly = testonly;

    // The path to the client main file of the module.
    this.clientPath = paths.client;

    // The path to the server main file of the module.
    this.serverPath = paths.server;

    // The name of the base module, or falsey otherwise.
    this.baseName = baseName;
  }

  async extractFromImport(network, game, state) {
    const fullPath = path.join(process.cwd(), this.root, this.serverPath);
    const {load} = await import(fullPath);

    // Inject our deps into node's require environment.
    const fakeEnv = {
      network,
      game,
      state,
      wallGeometry: wallGeometry.getGeo(),
      debug: easyLog('wall:module:' + this.name),
      assert,
    };

    const {server} = inject(load, fakeEnv);
    conform(server, Server);
    return {server};
  }
}
