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

import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';

import assert from '../../lib/assert.js';
import debugFactory from 'debug';
const debug = debugFactory('wall:module_def');
import conform from '../../lib/conform.js';
import inject from '../../lib/inject.js';
import {Server} from '../../lib/module_interface.js';
import util from 'util';
import * as wallGeometry from '../util/wall_geometry.js';
import * as geometry from '../../lib/geometry.js';

const importCache = {};
async function importIntoCache(moduleRoot, modulePath) {
  const fullPath = path.join(process.cwd(), moduleRoot, modulePath);
  const {load} = await import(fullPath);
  importCache[fullPath] = load;
  return load;
}

function extractFromImport(name, moduleRoot, modulePath, layoutGeometry, network, game, state) {
  const fullPath = path.join(process.cwd(), moduleRoot, modulePath);
  // TODO(applmak): When https://github.com/nodejs/node/issues/27492 is fixed,
  // rm the cache, and just import here.
  const load = importCache[fullPath];

  // Inject our deps into node's require environment.
  const fakeEnv = {
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
    assert,
  };

  const {server} = inject(load, fakeEnv);
  conform(server, Server);
  return {server};
};

/**
 * The ModuleDef class contains all the information necessary to load &
 * instantiate a module, including code location and config parameters.
 */
export class ModuleDef extends EventEmitter {
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
      this.whenLoadedPromise = this.checkValidity_();
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
  async checkValidity_() {
    this.valid = false;
    assert(this.clientPath, `No client_path found in '${this.name}'`);
    if (this.serverPath) {
      await importIntoCache(this.root, this.serverPath);
      extractFromImport(this.name, this.root, this.serverPath, wallGeometry.getGeo(), {}, {}, {});
      debug('Verified ' + path.join(this.root,this.serverPath));
    } else {
      debug('No server path specified. Using default server module.');
    }
    this.valid = true;
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
    if (this.serverPath) {
      const {server} = extractFromImport(this.name, this.root, this.serverPath, layoutGeometry, network, game, state);
      return new server(this.config, deadline);
    } else {
      return new Server;
    }
  }

  // Returns a JSON-serializable form of this for transmission to the client.
  serializeForClient() {
    return {
      name: this.name,
      path: path.join('/module/', this.name, this.clientPath),
      config: this.config,
      title: this.title,
      author: this.author,
    };
  }
}
