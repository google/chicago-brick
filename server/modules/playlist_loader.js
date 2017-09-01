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
var _ = require('underscore');
var debug = require('debug')('wall:playlist_loader');
var fs = require('fs');

var Layout = require('server/modules/layout');
var ModuleDef = require('server/modules/module_def');
var library = require('server/modules/module_library');

function parseJson(jsonString) {
  return RJSON.parse(jsonString);
}

class PlaylistLoader {

  constructor(flags) {
    this.flags = flags;
  }

  /** Returns the list of module names for a layout specification. */
  getModulesForLayout_(layout, collections) {
    let names = [];
    if (this.flags.module) {
      // Copy the module name list.
      names = this.flags.module.slice(0);
      if (names.length == 1) {
        // If we have one module, repeat it so transitions happen.
        // TODO(applmak): Once we support transition-on-reload, we don't need to do this.
        names = names.concat(names);
      }
      
      names.forEach(m => assert(m in library.modules, `--module "${m}" can't be found!'`));
    } else if (layout.collection) {
      // Special collection name to run all available modules.
      if (layout.collection == '__ALL__') {
        names = Object.keys(library.modules);
      } else {
        assert(
            layout.collection in collections,
            'Unknown collection name: ' + layout.collection);
        names = collections[layout.collection];
      }  
      names.forEach(m => assert(m in library.modules, `Module "${m}" referenced by collection "${layout.collection}" can't be found!'`));
    } else {
      assert('modules' in layout, 'Missing modules list in layout def!');
      names = layout.modules;
      names.forEach(m => assert(m in library.modules, `Module "${m}" can't be found!'`));
    }
    return names;
  }

  /** Creates a playlist JSON object from command-line flags. */
  getInitialPlaylistConfig() {
    // TODO(applmak): Verify this encoding.
    // TODO(applmak): Does this API need to exist?
    var playlistConfig = fs.readFileSync(this.flags.playlist, 'utf8');
    return parseJson(playlistConfig);
  }

  /** Parses a playlist JSON object into a list of Layouts. */
  parsePlaylist(config) {
    library.reset();
    var extraModules = config.modules || [];
    for (var m of extraModules) {
      assert(m.name && (m.extends || m.path), 'Invalid configuration: ' + m);
      if (m.extends) {
        assert(m.extends in library.modules, 'Module ' + m.name + 
          ' attempting to extend ' + m.extends + ' which was not found!');
        debug('Adding module ' + m.name + ' extending ' + m.extends);
        library.register(library.modules[m.extends].extend(
          m.name, m.title, m.author, m.config));
      } else {
        debug('Adding module ' + m.name + ' from ' + m.path);
        library.register(new ModuleDef(m.name, m.path, m.title, m.author, m.config));
      }
    }

    // TODO(applmak): If module is specified on the command-line, ignore whatever is set in the playlist.
    return config.playlist.map((layout) => {
      return new Layout({
        modules: this.getModulesForLayout_(layout, config.collections),
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
