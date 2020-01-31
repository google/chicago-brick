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
import {EmptyModuleDef} from './module_def.js';
import assert from '../../lib/assert.js';
import {easyLog} from '../../lib/log.js';
import path from 'path';
import {Server} from '../../lib/module_interface.js';
import conform from '../../lib/conform.js';
import inject from '../../lib/inject.js';
import * as wallGeometry from '../util/wall_geometry.js';

const log = easyLog('wall:module_library');

class ModuleLibrary extends EventEmitter {
  constructor() {
    super();

    this.reset();
  }
  register(def) {
    log.info('Registered', def.name);
    this.modules[def.name] = def;
    if (def.serverPath) {
      // Validate the module at the server path.
      this.loaded.set(def.name, this.extractServerClass(def.name, {
        network: {},
        game: {},
        state: {},
      }).then(() => {
        log.debugAt(1, 'Verified ' + path.join(def.root, def.serverPath));
        this.valid.set(def.name, true);
      }, err => {
        log.error(err);
      }));
    } else {
      this.valid.set(def.name, true);
      this.loaded.set(def.name, Promise.resolve());
    }
  }
  reset() {
    this.modules = {'_empty': new EmptyModuleDef};
    this.loaded = new Map;
    this.valid = new Map;
  }
  whenLoaded(name) {
    return this.loaded.get(name) || Promise.reject(new Error(`Unknown module ${name}`));
  }
  isValid(name) {
    return this.valid.get(name) || false;
  }
  async extractServerClass(name, deps) {
    const def = this.modules[name];
    const fullPath = path.join(process.cwd(), def.root, def.serverPath);
    const {load} = await import(fullPath);

    // Inject our deps into node's require environment.
    const fakeEnv = {
      ...deps,
      wallGeometry: wallGeometry.getGeo(),
      debug: easyLog('wall:module:' + name),
      assert,
    };

    const {server} = inject(load, fakeEnv);
    conform(server, Server);
    return {server};
  }
}

export default new ModuleLibrary;
