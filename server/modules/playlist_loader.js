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

var RJSON = require('relaxed-json');
var assert = require('assert');
var debug = require('debug')('wall:playlist_loader');
var fs = require('fs');

var Layout = require('server/modules/layout');
var library = require('server/modules/library');

class PlaylistLoader {

  constructor(flags) {
    this.flags = flags;
  }

  /** Determines the list of modules for a layout JSON config. */
  getModulesForLayout_(layout, collections) {
    if (this.flags.module) {
      var modules = this.flags.module.slice(0);
      // If we have one module, repeat it so transitions happen.
      return modules.length > 1 ? modules : [modules[0], modules[0]];
    }
    if (layout.collection) {
      // Special collection name to run all available modules.
      if (layout.collection == '__ALL__') {
        return Object.keys(library.allModules);
      }
      assert(
          layout.collection in collections,
          'Unknown collection name: ' + layout.collection);
      return collections[layout.collection];
    }
    assert('modules' in layout, 'Missing modules list');
    return layout.modules;
  }

  /** Creates a playlist JSON object from command-line flags. */
  getInitialPlaylistConfig() {
    var playlistConfig = fs.readFileSync(this.flags.playlist, 'utf8');
    return this.parseJson(playlistConfig);
  }

  parseJson(jsonString) {
    return RJSON.parse(jsonString);
  }

  /** Parses a playlist JSON object into a list of Layouts. */
  parsePlaylist(config) {
    var extraModules = config.modules || [];
    for (var m of extraModules) {
      assert(m.name && (m.extends || m.path), 'Invalid configuration: ' + m);
      if (m.extends) {
        debug('Adding module ' + m.name + ' extending ' + m.extends);
        library.registerModuleExtension(m.name, m.extends, m.title || '', m.author || '', m.config);
      } else {
        debug('Adding module ' + m.name + ' from ' + m.path);
        library.registerModule(m.name, m.path, m.title || '', m.author || '', m.config);
      }
    }

    return config.playlist.map((layout) => {
      var modules = this.getModulesForLayout_(
          layout, config.collections);
      for (var moduleName of modules) {
        if (!library.allModules[moduleName]) {
          throw Error('Unknown module: ' + moduleName);
        }
      }
      return new Layout({
        modules: modules,
        moduleDuration: this.flags.module_duration || layout.moduleDuration,
        duration: this.flags.layout_duration || layout.duration,
        maxPartitions: this.flags.max_partitions || layout.maxPartitions,
      });
    });
  }

  /** Returns a layout list from command-line flags. */
  getInitialPlaylist() {
    return this.parsePlaylist(this.getInitialPlaylistConfig());
  }
}

module.exports = PlaylistLoader;
