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

'use strict';

var assert = require('assert');

/**
 * A data class defining a module. This combines a code location
 * and a set of config parameters, so that we can give different names
 * to modules that have the same code but different configuration.
 */
class Module {
  constructor(name, path, title, author, config) {
    this.name = name;
    this.path = path;
    this.config = config || {};
    this.title = title;
    this.author = author;
  }
}

var moduleList = [];

var allModules = {};
moduleList.forEach((m) => allModules[m.name] = m);

function registerModule(name, path, title, author, config) {
  allModules[name] = new Module(name, path, title || '', author || '', config);
}

function registerModuleExtension(name, extendsName, title, author, config) {
  assert(extendsName in allModules, 'Unknown module "' + extendsName + '"');
  var orig = allModules[extendsName];
  allModules[name] = new Module(name, orig.path, title || orig.title, author || orig.author, config);
}

module.exports = {
  registerModule: registerModule,
  registerModuleExtension: registerModuleExtension,

  // Map of module name to module info object.
  allModules: allModules,
};
