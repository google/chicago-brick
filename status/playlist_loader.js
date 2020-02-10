/* Copyright 2019 Google Inc. All Rights Reserved.

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

import RJSON from 'relaxed-json';
import assert from '../lib/assert.js';
import fs from 'fs';
import {Layout} from './layout.js';
import {easyLog} from '../lib/log.js';
import glob from 'glob';
import path from 'path';
import {ModuleDef} from '../server/modules/module_def.js';

const log = easyLog('wall:playlist_loader');

/**
 * Looks through the moduleDirs for brick.json files.
 * Returns a map of module name => module def.
 */
export function loadAllBrickJson(moduleDirs) {
  // Try to find all of the modules on disk. We scan them all in order to
  // figure out the whole universe of modules. We have to do this, because
  // if we are told to play a module by name, we don't know which path to
  // load or whatever config to use.
  const bricks = moduleDirs.flatMap(p => glob.sync(path.join(p, 'brick.json')));
  const allConfigs = bricks.flatMap(b => {
    const def = fs.readFileSync(b, {encoding: 'utf8'});
    const root = path.dirname(b);
    try {
      const config = RJSON.parse(def);
      if (Array.isArray(config)) {
        for (const c of config) {
          c.root = root;
        }
        return config;
      } else {
        config.root = root;
        return [config];
      }
    } catch (e) {
      log.error(e);
      log.error(`Skipping invalid config in: ${b}`);
      return [];
    }
  });

  return loadAllModules(allConfigs);
}

/**
 * Turns module configs into module defs. Returns a map of name => def.
 */
export function loadAllModules(configs, defsByName = new Map) {
  // Sort the base before the extends so that we process them in this order.
  const sortedConfigs = [
    ...configs.filter(c => !c.extends),
    ...configs.filter(c => c.extends),
  ];

  return sortedConfigs.reduce((map, config) => {
    let def;
    if (config.extends) {
      const base = map.get(config.extends);
      if (!base) {
        log.error(`Module ${config.name} attempted to extend module ${config.extends}, which cannot be found.`);
        return map;
      }
      // Augment the base config with the extended config.
      const extendedConfig = {...base.config, ...config.config || {}};
      def = new ModuleDef(config.name, base.root, {
        server: base.serverPath,
        client: base.clientPath,
      }, base.name, extendedConfig, config.credit || {}, config.testonly);
    } else {
      def = new ModuleDef(config.name, config.root, {
        server: config.path || config.serverPath || config.server_path,
        client: config.path || config.clientPath || config.client_path,
      }, null, config.config || {}, config.credit || {}, config.testonly);
    }
    map.set(config.name, def);
    return map;
  }, defsByName);
}

/**
 * Loads a playlist from a file and turns it into a list of Layout objects.
 */
export function loadPlaylistFromFile(path, defsByName) {
  const contents = fs.readFileSync(path, {encoding: 'utf-8'});
  const parsedPlaylist = RJSON.parse(contents);
  const {collections, playlist, modules} = parsedPlaylist;
  loadAllModules(modules || [], defsByName);

  return playlist.map(layout => {
    const {collection, modules} = layout;

    let moduleNames
    if (collection) {
      if (collection == '__ALL__') {
        moduleNames = [...defsByName.values()]
            .filter(d => !d.testonly)
            .map(d => d.name);
      } else {
        assert(collections[collection], `Unknown collection name: ${collection}`);
        moduleNames = [...collections[collection]];
      }
    } else {
      assert(modules, 'Missing modules list in layout def!');
      moduleNames = [...modules];
    }

    return new Layout({
      modules: moduleNames,
      moduleDuration: layout.moduleDuration,
      duration: layout.duration,
    });
  });
}
