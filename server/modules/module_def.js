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
const fs = require('fs');

const assert = require('lib/assert');
const debug = require('debug')('wall:module_def');
const debugFactory = require('debug');
const fakeRequire = require('server/fake_require');
const module_interface = require('lib/module_interface');
const safeEval = require('lib/eval');
const util = require('util');
const wallGeometry = require('server/util/wall_geometry');
const geometry = require('lib/geometry');

const read = (path) => {
  return new Promise(function(resolve, reject) {
    fs.readFile(path, 'utf-8', function(err, content) {
      if (err) {
        reject(err);
      } else {
        resolve(content);
      }
    });
  });
};

const evalModule = (contents, name, path, layoutGeometry, network, game, state) => {
  let classes = {};
  
  // Inject our deps into node's require environment.
  let fakeRequireInstance = fakeRequire.createEnvironment({
    network,
    game,
    state,
    wallGeometry: new geometry.Polygon(layoutGeometry.points.map((p) => {
      return {
        x: p.x - layoutGeometry.extents.x,
        y: p.y - layoutGeometry.extents.y
      };
    })),
    debug: debugFactory('wall:module:' + name),
    globalWallGeometry: wallGeometry.getGeo(),
    
    // The main registration function.
    register: function(server, client) {
      classes.server = server;
      classes.client = client;
    },
  }, path);
  
  let sandbox = {
    require: fakeRequireInstance,
    serverRequire: fakeRequireInstance
  };
  
  // Use safeEval to actually run the script so that Node doesn't leak
  // anything: https://github.com/nodejs/node/issues/3113
  // TODO(applmak): Convert this to just a require of this file.
  safeEval(contents, sandbox);
  
  // Clean up our mess.
  fakeRequireInstance.destroy();
  
  return classes;
};

const verify = (name, contents, path) => {
  // Eval using fake globals.
  const classes = evalModule(contents, name, path, wallGeometry.getGeo(), {}, {}, {});
  
  if (!classes.server) {
    debug('Module did not register a server-side module!');
    return false;
  }
  if (!(classes.server.prototype instanceof module_interface.Server)) {
    debug('Module\'s server-side module did not implement module_interface.Server!');
    return false;
  }
  if (!classes.client) {
    debug('Module did not register a client-side module!');
    return false;
  }  
  if (!(classes.client.prototype instanceof module_interface.Client)) {
    debug('Module\'s client-side module did not implement module_interface.Client!');
    return false;
  }
  
  return true;
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
    
    // The path to the main file of the module.
    this.path = '';
    
    // If true, the module has no parse errors in its source.
    this.valid = false;
    
    // The most recently validated source to the module.
    this.def = '';
    
    if (pathOrBaseModule instanceof ModuleDef) {
      let base = pathOrBaseModule;
      this.path = base.path;

      let updateValidity = () => {
        this.valid = base.valid;
        if (this.valid) {
          this.def = base.def;
        }
      };
      
      // When the base is loaded, check its valid status.
      base.whenLoadedPromise.then(updateValidity);
      
      // I'm loaded when my base is loaded.
      this.whenLoadedPromise = base.whenLoadedPromise;
      
      // Also, register for any reloads, and reset validity.
      base.on('reloaded', updateValidity);
    } else if (name != '_empty') {
      // TODO(applmak): ^ this hacky.
      this.path = pathOrBaseModule;
      this.checkValidity_();
    }
  }

  // Returns a custom object for serializing in debug logs.
  inspect(depth, opts) {
    return {
      name: this.name,
      path: this.path,
      config: util.inspect(this.config),
      title: this.title,
      author: this.author
    };
  }
  // Returns a new module def that extends this def with new configuration.
  extend(name, title, author, config) {
    return new ModuleDef(
      name,
      this,
      title === undefined ? '' : (title || this.title),
      author === undefined ? '' : (author || this.author),
      config);
  }
  
  // Loads a module from disk asynchronously, assigning def when complete.
  checkValidity_() {
    let loadModule = () => {
      let rewatch = () => {
        // Watch for future changes.
        debug('Watching', this.path);
        let watch = fs.watch(this.path, {persistent: true}, event => {
          debug('Module changed! Reloading', this.path);
          watch.close();
          loadModule();
          // When the load is finished, tell listeners that we reloaded.
          this.whenLoadedPromise.then(() => this.emit('reloaded'));
        });
      };
    
      this.whenLoadedPromise = read(this.path).then(contents => {
        debug('Read ' + this.path);
        // Prepend a directive to make sure the module runs in strict mode.
        // Append a directive that tells Chrome and Node that the client script
        // is, in fact, a file. This makes debugging these far simpler.
        contents = `"use strict";${contents}\n//# sourceURL=${this.path}\n`;
        
        // Start rewatcher, regardless of status.
        rewatch();
        
        if (verify(this.name, contents, this.path)) {
          debug('Verified ' + this.path);
          this.valid = true;
          this.def = contents;
        } else {
          debug('Failed verification at ' + this.path);
          throw new Error('Script at "' + this.path + '" is not verifiable!');
        }
      }, e => {
        debug(this.path + ' not found!');
      
        // Intentionally do not restart watcher.
        // Allow users to note that this module failed to load correctly.
        throw e;
      }).catch(e => {
        this.valid = false;
        debug(e);
        throw e;
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
  instantiate(layoutGeometry, network, game, state, deadline) {
    // Only instantiate valid modules.
    assert(this.valid, 'Attempt to instantiate invalid module!');
    let classes = evalModule(this.def, this.name, this.path, layoutGeometry, network, game, state);
    return new classes.server(this.config, deadline);
  }
  
  // Returns a JSON-serializable form of this for transmission to the client.
  serializeForClient() {
    return {
      name: this.name,
      path: this.path,
      config: this.config,
      title: this.title,
      author: this.author,
    };
  }
}

// Export the module def class.
module.exports = ModuleDef;

