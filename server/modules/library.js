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

const fs = require('fs');

const Noise = require('noisejs');
const debugFactory = require('debug');
const random = require('random-js')();
const _ = require('underscore');

const debug = require('debug')('wall:library');
const fakeRequire = require('lib/fake_require');
const geometry = require('lib/geometry');
const googleapis = require('server/util/googleapis');
const moduleAssert = require('lib/assert');
const module_interface = require('lib/module_interface');
const network = require('server/network/network');
const safeEval = require('lib/eval');
const wallGeometry = require('server/util/wall_geometry');

// Node modules made available to server-side modules.
// Entries with "undefined" are only available on the client;
// we mention them here so that the server module can call require()
// without throwing.
var exposedNodeModules = {
  NeighborPersistence: undefined,
  Noise: Noise,
  assert: moduleAssert,
  asset: function(){},
  googleapis: googleapis,
  leaflet: undefined,
  loadYoutubeApi: undefined,
  random: random,
  three: undefined,
  underscore: _,
};

// Creates an execution context for server-side modules.
// Cf. the client-side version in client/modules/module_manager.js.
function serverSandbox(name, opt_dependencies) {
  return _.extend({
    ServerModuleInterface: module_interface.Server,
    ClientModuleInterface: module_interface.Client,
    Promise: Promise,
    debug : debugFactory('wall:module:' + name),
    globalWallGeometry: wallGeometry.getGeo(),
    geometry: geometry,
    require: fakeRequire.createEnvironment(exposedNodeModules),
  }, opt_dependencies || {});
}

// Verifies that the script (as a string) is valid, according to our spec.
// Returns a ModuleDefinition or null, in the case of an error.
let loadAndVerifyScript = function(name, script) {
  try {
    var serverSideModuleDef, clientSideModuleDef;
    var sandbox = _.extend({
      register: function(serverSide, clientSide) {
        serverSideModuleDef = serverSide;
        clientSideModuleDef = clientSide;
      },
      network: network,
      // In verify mode, the local wall geometry is the same as the global.
      wallGeometry: wallGeometry.getGeo(),
    }, serverSandbox(name));
    safeEval(script, sandbox);
    debug('Parsed correctly');
    if (!serverSideModuleDef) {
      debug('Module did not register a server-side module!');
      return null;
    }
    if (!(serverSideModuleDef.prototype instanceof module_interface.Server)) {
      debug(
          'Module\'s server-side module did not implement ServerModuleInterface!');
      return null;
    }
    if (clientSideModuleDef &&
        !(clientSideModuleDef.prototype instanceof module_interface.Client)) {
      debug(
          'Module\'s client-side module did not implement ClientModuleInterface!');
      return null;
    }
    // Send the WHOLE script to the client, or it will only see the constructor!
    return script;
  } catch (e) {
    debug('Failed to load script!', e);
    debug(e.stack);
    return null;
  }
};

// Schedules a module to be loaded at 'path', verifies that it's valid, and
// returns promise that will be resolved if valid or rejected if not.
let loadModuleAtPath = function(path) {
  return new Promise(function(resolve, reject) {
    fs.readFile(path, 'utf-8', function(err, content) {
      if (err) {
        reject(err);
        return;
      }
      // Prepend a directive to make sure the module runs in strict mode.
      // Append a directive that tells Chrome and Node that the client script
      // is, in fact, a file. This makes debugging these far simpler.
      content = `"use strict";${content}\n//# sourceURL=${path}\n`;
      try {
        var moduleDef = loadAndVerifyScript(path, content);
        if (!moduleDef) {
          // Not verifiable! Abort!
          throw new Error('Script at "' + path + '" is not verifiable!');
        }
        resolve(moduleDef);
      } catch (e) {
        reject(e);
      }
    });
  });
};

class ModuleDefinitionLibrary {
  constructor() {
    // map of path -> promise<string>
    // This map is only populated during the loading process.
    this.moduleLoader = {};

    // map of path -> string.
    this.modules = {};
  }
  load(path) {
    if (path in this.moduleLoader) {
      // In the middle of loading... so join.
      return this.moduleLoader[path];
    }

    let loadModule = () => {
      let rewatch = () => {
        // Clean up in-progress module loading.
        delete this.moduleLoader[path];

        // Watch for future changes.
        let watch = fs.watch(path, {persistent: true}, (event) => {
          debug('Module changed! Reloading', path);
          watch.close();
          loadModule();
        });
      };
    
      let m = loadModuleAtPath(path).then((def) => {
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
  }
  
  // Loads a previously-verified script for execution.
  // Returns a class definition for the server-side module.
  loadServerScript(name, dependencies, script) {
    var serverSideModuleDef;
    var sandbox = _.extend({
      register: function(serverSide, unused) {
        serverSideModuleDef = serverSide;
      },
    }, serverSandbox(name, dependencies));
    // Use safeEval to actually run the script so that Node doesn't leak
    // anything: https://github.com/nodejs/node/issues/3113
    safeEval(script, sandbox);
    return serverSideModuleDef;
  }
}

// Export the singleton instance of the library.
module.exports = new ModuleDefinitionLibrary;

