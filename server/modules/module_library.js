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
import {ModuleDef} from './module_def.js';
import assert from '../../lib/assert.js';
import {easyLog} from '../../lib/log.js';
import path from 'path';

const log = easyLog('wall:module_library');

class EmptyModuleDef extends ModuleDef {
  constructor() {
    super('_empty', '', {}, '', {}, {}, true);
    // TODO(applmak): ^ this hacky.
  }
}

class ModuleLibrary extends EventEmitter {
  constructor() {
    super();

    this.reset();
  }
  register(def) {
    assert(!(def.name in this.modules), 'Def ' + def.name + ' already exists!');
    log.info('Registered', def.name);
    this.modules[def.name] = def;
    if (def.serverPath) {
      // Validate the module at the server path.
      this.loaded.set(def.name, def.extractFromImport({}, {}, {}).then(() => {
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
}

export default new ModuleLibrary;
