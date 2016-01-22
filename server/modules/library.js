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

var fs = require('fs');

var debug = require('debug')('wall:library');
var Module = require('./module_defs');

var ModuleDefinitionLibrary = function() {
  // map of path -> promise<string>
  // A key only exists during the loading process.
  this.moduleLoader = {};

  // map of path -> string
  // Only valid modules are stored here.
  this.modules = {};
};
ModuleDefinitionLibrary.prototype.load = function(path) {
  if (path in this.moduleLoader) {
    // In the middle of loading... so join.
    return this.moduleLoader[path];
  }

  var loadModule = () => {
    var rewatch = () => {
      // Clean up in-progress module loading.
      delete this.moduleLoader[path];

      // Watch for future changes.
      var watch = fs.watch(path, {persistent: true}, (event) => {
        debug('Module changed! Reloading', path);
        watch.close();
        loadModule();
      });
    };
    
    var m = Module.loadModuleAtPath(path).then((def) => {
      debug('Loaded', path);
      
      // Save the updated, valid module.
      this.modules[path] = def;
      
      rewatch();
      
      return def;
    }, (e) => {
      debug('Error loading ' + path);
      debug(e);
      
      rewatch();

      return Promise.reject(e);
    });
    
    this.moduleLoader[path] = m;
    return m;
  };

  return loadModule();
};
module.exports = new ModuleDefinitionLibrary;
