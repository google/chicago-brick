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
// A method for loading a file at a path, and verifying that it is
// interpretable and runs, and that running it causes a registration to occur,
// AND that running it causes no additional keys to be registered.

var _ = require('underscore');
var fs = require('fs');
var Debug = require('debug');
var Noise = require('noisejs');
var moduleDebug = Debug('wall:module');
var random = require('random-js')();

require('lib/promise');
var moduleAssert = require('lib/assert');
var safeEval = require('lib/eval');
var fakeRequire = require('lib/fake_require');
var geometry = require('lib/geometry');
var googleapis = require('server/util/googleapis');
var module_interface = require('lib/module_interface');
var network = require('server/network/network');
var wallGeometry = require('server/util/wall_geometry');

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
    debug : Debug('wall:module:' + name),
    globalWallGeometry: wallGeometry.getGeo(),
    geometry: geometry,
    require: fakeRequire.createEnvironment(exposedNodeModules),
  }, opt_dependencies || {});
}

// Loads a previously-verified script for execution.
// Returns a class definition for the server-side module.
exports.loadServerScript = function(name, dependencies, script) {
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
};

// Verifies that the script (as a string) is valid, according to our spec.
// Returns a ModuleDefinition or null, in the case of an error.
exports.loadAndVerifyScript = function(name, script) {
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
    moduleDebug('Parsed correctly');
    if (!serverSideModuleDef) {
      moduleDebug('Module did not register a server-side module!');
      return null;
    }
    if (!(serverSideModuleDef.prototype instanceof module_interface.Server)) {
      moduleDebug(
          'Module\'s server-side module did not implement ServerModuleInterface!');
      return null;
    }
    if (clientSideModuleDef &&
        !(clientSideModuleDef.prototype instanceof module_interface.Client)) {
      moduleDebug(
          'Module\'s client-side module did not implement ClientModuleInterface!');
      return null;
    }
    // Send the WHOLE script to the client, or it will only see the constructor!
    return script;
  } catch (e) {
    moduleDebug('Failed to load script!', e);
    moduleDebug(e.stack);
    return null;
  }
};

// Schedules a module to be loaded at 'path', verifies that it's valid, and
// returns promise that will be resolved if valid or rejected if not.
exports.loadModuleAtPath = function(path) {
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
        var moduleDef = exports.loadAndVerifyScript(path, content);
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
