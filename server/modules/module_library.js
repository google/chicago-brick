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

'use strict';

const EventEmitter = require('events');
const ModuleDef = require('server/modules/module_def');
const assert = require('assert');

class EmptyModuleDef extends ModuleDef {
  constructor() {
    super('_empty');
    // TODO(applmak): ^ this hacky.
    // However, b/c of the hack, this module will never become valid.
    this.whenLoadedPromise = Promise.resolve(this);
  }
}

class ModuleLibrary extends EventEmitter {
  constructor() {
    super();
    
    this.reset();
  }
  register(def) {
    assert(!(def.name in this.modules), 'Def ' + def.name + ' already exists!');
    this.modules[def.name] = def;
    // We can safely use 'on' rather than 'once' here, because neither the 
    // moduledefs nor this library are ever destroyed.
    def.on('reloaded', () => {
      this.emit('reloaded', def);
    });
  }
  reset() {
    this.modules = {'_empty': new EmptyModuleDef};
  }
}

module.exports = new ModuleLibrary;
