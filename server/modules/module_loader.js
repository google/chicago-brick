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
import assert from '../../lib/assert.js';
import {easyLog} from '../../lib/log.js';
import fs from 'fs';
import glob from 'glob';
import library from './module_library.js';
import path from 'path';
import {ModuleDef} from './module_def.js';
const log = easyLog('wall:module_loader');

export class ModuleLoader {
  constructor(flags) {
    this.flags = flags;
  }

  /**
   * Load modules based on flags and include overrides from playlist config.
   */
  loadModules(playlistConfig) {
    library.reset();
    log.debugAt(1, 'module_dir', this.flags.module_dir);
    const configPaths = this.flags.module_dir.flatMap(p => {
      return glob.sync(path.join(p, 'brick.json'));
    });

    // TODO(bmt): Do something more clever here to order loading based on
    // extends dependencies. Right now it relies on the order of loading which
    // will be more fragile when the config is spread across several packages.
    const configs = configPaths.flatMap(cfgPath => this.loadModule(cfgPath))
        .filter(cfg => {
      if (!cfg.name) {
        log.warn('Skipping invalid configuration:', cfg);
        return false;
      }
      return true;
    });

    // We support overriding config values of existing modules or extending
    // existing modules from the playlist.
    const playlistModules = playlistConfig.modules || [];
    const extensions = playlistModules.filter(m => m.extends);
    const overrides = playlistModules.filter(m => !m.extends);

    // Add modules to library.
    configs.concat(extensions).forEach((defaultConfig) => {
      // Apply any overrides from the playlist modules.
      const cfg = Object.assign(
          {},
          defaultConfig,
          ...overrides.filter(o => o.name == defaultConfig.name));

      if (cfg.extends) {
        assert(cfg.extends in library.modules, 'Module ' + cfg.name +
          ' attempting to extend ' + cfg.extends + ' which was not found!');
        log.debugAt(1, 'Adding module ' + cfg.name + ' extending ' + cfg.extends);
        library.register(library.modules[cfg.extends].extend(
            cfg.name, cfg.config || {}, cfg.credit || {}, cfg.testonly));
      } else {
        const paths = {client: cfg.path || cfg.client_path, server: cfg.path || cfg.server_path};
        log.debugAt(1, 'Adding module ' + cfg.name);
        library.register(new ModuleDef(
              cfg.name, cfg.root, paths, cfg.config || {}, cfg.credit || {}, cfg.testonly));
      }
    });

    // Show errors for any new module definitions that were in the playlist.
    const badPlaylistConfigs = overrides.filter(cfg => {
      return !library.modules[cfg.name];
    });
    badPlaylistConfigs.forEach(cfg => {
      log.warn(`Skipping new module ${cfg.name} in playlist.`);
    });
    if (badPlaylistConfigs.length) {
      log.warn('Only overrides and extensions are supported in the playlist. ' +
            'For new modules add a brick.json file in the module directory.');
    }
  }

  loadModule(moduleConfigFile) {
    var moduleConfig = fs.readFileSync(moduleConfigFile, 'utf8');
    const root = path.dirname(moduleConfigFile);
    try {
      const cfg = RJSON.parse(moduleConfig);
      const cfgs = Array.isArray(cfg) ? cfg : [cfg];
      cfgs.forEach((c) => c.root = root);
      return cfgs;
    } catch (e) {
      log.error(e);
      log.error(`Skipping invalid config in: ${root}/brick.json`);
      return [];
    }
  }
}
