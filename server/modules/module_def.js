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
const register = require('lib/register');
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

const evalModule = (contents, name, layoutGeometry, network, game, state) => {
  let classes = {};

  let sandbox = {
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
    register: register.create(classes),
    require,
  };
  
  // Use safeEval to actually run the script so that Node doesn't leak
  // anything: https://github.com/nodejs/node/issues/3113
  safeEval(contents, sandbox);
  return classes;
};

const verify = (name, contents) => {
  // Eval using fake globals.
  const classes = evalModule(contents, name, wallGeometry.getGeo(), {}, {}, {});
  
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
    
    // The string source of the module.
    this.def_ = '';
    if (pathOrBaseModule instanceof ModuleDef) {
      // The promise that when set, indicates the module is loaded.
      this.loadPromise = pathOrBaseModule.loadPromise.then(() => {
        this.def_ = pathOrBaseModule.def_;
      });
    } else {
      this.loadAndWatch_(pathOrBaseModule);
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
  loadAndWatch_(path) {
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
    
      this.loadPromise = read(path).then((contents) => {
        debug('Read ' + path);
        // Prepend a directive to make sure the module runs in strict mode.
        // Append a directive that tells Chrome and Node that the client script
        // is, in fact, a file. This makes debugging these far simpler.
        contents = `"use strict";${contents}\n//# sourceURL=${path}\n`;
        
        // Start rewatcher, regardless of status.
        rewatch();
        
        if (verify(this.name, contents)) {
          debug('Verified ' + path);
          this.def_ = contents;
        } else {
          debug('Failed verification at ' + path);
          Promise.reject(new Error('Script at "' + path + '" is not verifiable!'));
        }
      }, (e) => {
        debug(path + ' not found!');
        debug(e);
      
        // Intentionally do not restart watcher.
        // Allow users to note that this module failed to load correctly.
        return Promise.reject(e);
      }).catch((e) => {
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
    let classes = evalModule(this.def_, this.name, layoutGeometry, network, game, state);
    return new classes.server(this.config, deadline);
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

