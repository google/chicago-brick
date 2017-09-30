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

const assert = require('assert');
const debug = require('debug')('wall:module_loader');
const fs = require('fs');
const library = require('server/modules/module_library');
const ModuleDef = require('server/modules/module_def');
const glob = require('glob');
const path = require('path');
const RJSON = require('relaxed-json');
const _ = require('underscore');

class ModuleLoader {
  constructor(flags) {
    this.flags = flags;
  }

  /**
   * Load modules based on flags and include overrides from playlist config.
   */
  loadModules(playlistConfig) {
    library.reset();
    debug(this.flags.module_dir);
    const configPaths = _.flatten(this.flags.module_dir.map((p) => {
      return glob.sync(path.join(p, 'brick.json'));
    }));

    // TODO(bmt): Do something more clever here to order loading based on
    // extends dependencies. Right now it relies on the order of loading which
    // will be more fragile when the config is spread across several packages.
    const configs = _.filter(_.flatten(configPaths.map((cfgPath) => {
      return this.loadModule(cfgPath);
    }, (cfg) => {
      if (!cfg.name || (!cfg.extends && !cfg.path)) {
        debug('Skipping invalid configuration: ' + cfg);
        return false;
      }
      return true;
    })));

    const overrides = playlistConfig.modules || [];

    // Add modules to library.
    configs.forEach((defaultConfig) => {
      const cfg = _.defaults(
        _.where(overrides, {name: defaultConfig.name}) || {},
        defaultConfig);

      if (cfg.extends) {
        assert(cfg.extends in library.modules, 'Module ' + cfg.name + 
          ' attempting to extend ' + cfg.extends + ' which was not found!');
        debug('Adding module ' + cfg.name + ' extending ' + cfg.extends);
        library.register(library.modules[cfg.extends].extend(
          cfg.name, cfg.title, cfg.author, cfg.config));
      } else {
        debug('Adding module ' + cfg.name + ' from ' + path.join(cfg.root, cfg.path));
        library.register(new ModuleDef(cfg.name, cfg.root, cfg.path, cfg.title,
              cfg.author, cfg.config));
      }
    });
  }

  loadModule(moduleConfigFile) {
    var moduleConfig = fs.readFileSync(moduleConfigFile, 'utf8');
    const root = path.dirname(moduleConfigFile);
    try {
      const cfg = RJSON.parse(moduleConfig);
      const cfgs = _.isArray(cfg) ? cfg : [cfg];
      cfgs.forEach((c) => c.root = root);
      return cfgs;
    } catch (e) {
      debug(e);
      debug(`Skipping invalid config in: ${root}/brick.json`);
      return [];
    }
  }
}

module.exports = ModuleLoader;
