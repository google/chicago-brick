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

const EventEmitter = require('events');
const fs = require('fs');

const debugFactory = require('debug');
const random = require('random-js')();
const _ = require('underscore');

const debug = require('debug')('wall:library');
const fakeRequire = require('lib/fake_require');
const googleapis = require('server/util/googleapis');
const module_interface = require('lib/module_interface');
const network = require('server/network/network');
const safeEval = require('lib/eval');
const util = require('util');
const wallGeometry = require('server/util/wall_geometry');

// Creates an execution context for server-side modules.
// Cf. the client-side version in client/modules/module_manager.js.
function serverSandbox(name, opt_dependencies) {
  return _.extend({
    debug : debugFactory('wall:module:' + name),
    globalWallGeometry: wallGeometry.getGeo(),
    require: require,
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
          'Module\'s server-side module did not implement module_interface.Server!');
      return null;
    }
    if (clientSideModuleDef &&
        !(clientSideModuleDef.prototype instanceof module_interface.Client)) {
      debug(
          'Module\'s client-side module did not implement module_interface.Client!');
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

/**
 * The ModuleDef class contains all the information necessary to load & 
 * instantiate a module, including code location and config parameters.
 */
class ModuleDef extends EventEmitter {
  constructor(name, pathOrBaseModule, title, author, config) {
    super();
    this.name = name;
    this.config = config || {};
    this.title = title;
    this.author = author;
    
    // The string source of the module.
    this.def_ = '';
    if (pathOrBaseModule instanceof ModuleDef) {
      // The promise that when set, indicates the module is loaded.
      this.loadPromise = pathOrBaseModule.loadPromise.then(() => {
        this.def_ = pathOrBaseModule.def_;
      });
    } else {
      this.load_(pathOrBaseModule);
    }
  }

  // Returns a custom object for serializing in debug logs.
  inspect(depth, opts) {
    return {
      name: this.name,
      config: util.inspect(this.config),
      title: this.title,
      author: this.author
    };
  }
  // Returns a new module def that extends this def with new configuration.
  extend(name, title, author, config) {
    return new ModuleDef(name, this,
      title || this.title, author || this.author, config);
  }
  // Loads a module from disk asynchronously, assigning def when complete.
  load_(path) {
    let loadModule = () => {
      let rewatch = () => {
        // Watch for future changes.
        debug('Watching', path);
        let watch = fs.watch(path, {persistent: true}, (event) => {
          debug('Module changed! Reloading', path);
          watch.close();
          loadModule();
          // When the load is finished, tell listeners that we reloaded.
          this.loadPromise.then(() => this.emit('reloaded'));
        });
      };
    
      this.loadPromise = loadModuleAtPath(path).then((def) => {
        debug('Loaded', path);
        this.def_ = def;
      
        // Start rewatcher.
        rewatch();
      }, (e) => {
        debug('Error loading ' + path);
        debug(e);
      
        // Start rewatcher, despite error.
        rewatch();

        // Allow users to note that this module failed to load correctly.
        return Promise.reject(e);
      });
    };

    loadModule();
  }
  
  // Instantiates this server-side version of this module, with any additional
  // globals being passed along.
  // TODO(applmak): Once automatic globals are removed, cache the constructor
  // after the eval (do it on load), then change the require to construct the
  // per-module globals (like network, which required 'deadline') to occur
  // dynamically. Basically, make this module's 'require' somehow delegate to
  // this particular instantiation.
  instantiate(additionalGlobals, deadline) {
    
    var serverSideModuleDef;
    var sandbox = _.extend({
      register: function(serverSide, unused) {
        serverSideModuleDef = serverSide;
      },
    }, serverSandbox(this.name, additionalGlobals));
    // Use safeEval to actually run the script so that Node doesn't leak
    // anything: https://github.com/nodejs/node/issues/3113
    safeEval(this.def_, sandbox);
    
    return new serverSideModuleDef(this.config, deadline);
  }
  
  // Returns a JSON-serializable form of this for transmission to the client.
  serializeForClient() {
    return {
      name: this.name,
      config: this.config,
      title: this.title,
      author: this.author,
      def: this.def_
    };
  }
}

// Export the module def class.
module.exports = ModuleDef;

