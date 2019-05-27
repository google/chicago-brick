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
const path = require('path');

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

const evalModule = (contents, name, moduleRoot, layoutGeometry, network, game, state) => {
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
  }, moduleRoot);

  let sandbox = {
    require: fakeRequireInstance,
    serverRequire: fakeRequireInstance
  };

  try {
    // Use safeEval to actually run the script so that Node doesn't leak
    // anything: https://github.com/nodejs/node/issues/3113
    // TODO(applmak): Convert this to just a require of this file.
    safeEval(contents, sandbox);

  } finally {
    // Clean up our mess.
    fakeRequireInstance.destroy();
  }

  return classes;
};

const verify = (name, contents, moduleRoot) => {
  // Eval using fake globals.
  const classes = evalModule(contents, name, moduleRoot, wallGeometry.getGeo(), {}, {}, {});

  if (!classes.server) {
    debug('Module did not register a server-side module!');
    return false;
  }
  if (!(classes.server == module_interface.Server ||
        classes.server.prototype instanceof module_interface.Server)) {
    debug('Module\'s server-side module did not implement module_interface.Server!');
    return false;
  }

  return true;
};

/**
 * The ModuleDef class contains all the information necessary to load &
 * instantiate a module, including code location and config parameters.
 */
class ModuleDef extends EventEmitter {
  constructor(name, moduleRoot, pathsOrBaseModule, title, author, config) {
    super();
    this.name = name;
    this.root = moduleRoot;
    this.config = config || {};
    this.title = title;
    this.author = author;

    // The path to the client main file of the module.
    this.clientPath = '';

    // The path to the server main file of the module.
    this.serverPath = '';

    // If true, the module has no parse errors in its source.
    this.valid = false;

    // The most recently validated source to the module.
    this.def = '';

    if (pathsOrBaseModule.base) {
      let base = pathsOrBaseModule.base;
      this.clientPath = base.clientPath;
      this.serverPath = base.serverPath;

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
      this.clientPath = pathsOrBaseModule.client;
      this.serverPath = pathsOrBaseModule.server;
      this.checkValidity_();
    }
  }

  // Returns a custom object for serializing in debug logs.
  inspect(depth, opts) {
    return {
      name: this.name,
      root: this.root,
      clientPath: this.clientPath,
      serverPath: this.serverPath,
      config: util.inspect(this.config),
      title: this.title,
      author: this.author
    };
  }
  // Returns a new module def that extends this def with new configuration.
  extend(name, title, author, config) {
    return new ModuleDef(
      name,
      this.root,
      {base: this},
      title === undefined ? '' : (title || this.title),
      author === undefined ? '' : (author || this.author),
      config);
  }

  // Loads a module from disk asynchronously, assigning def when complete.
  checkValidity_() {
    const fullPath = path.join(this.root, this.serverPath);
    let loadModule = () => {
      let rewatch = () => {
        // Watch for future changes.
        debug('Watching', fullPath);
        let watch = fs.watch(fullPath, {persistent: true}, event => {
          debug('Module changed! Reloading', fullPath);
          watch.close();
          loadModule();
          // When the load is finished, tell listeners that we reloaded.
          this.whenLoadedPromise.then(() => this.emit('reloaded'));
        });
      };

      this.whenLoadedPromise = read(fullPath).then(contents => {
        debug('Read ' + fullPath);
        // Prepend a directive to make sure the module runs in strict mode.
        // Append a directive that tells Chrome and Node that the client script
        // is, in fact, a file. This makes debugging these far simpler.
        contents = `"use strict";${contents}\n//# sourceURL=${fullPath}\n`;

        // Start rewatcher, regardless of status.
        rewatch();

        if (verify(this.name, contents, this.root)) {
          debug('Verified ' + fullPath);
          this.valid = true;
          this.def = contents;
        } else {
          debug('Failed verification at ' + fullPath);
          throw new Error('Script at "' + fullPath + '" is not verifiable!');
        }
      }, e => {
        debug(fullPath + ' not found!');

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
    let classes = evalModule(this.def, this.name, this.root, layoutGeometry, network, game, state);
    return new classes.server(this.config, deadline);
  }

  // Returns a JSON-serializable form of this for transmission to the client.
  serializeForClient() {
    return {
      name: this.name,
      path: this.clientPath,
      config: this.config,
      title: this.title,
      author: this.author,
    };
  }
}

// Export the module def class.
module.exports = ModuleDef;
