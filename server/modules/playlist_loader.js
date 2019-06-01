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

import RJSON from 'relaxed-json';
import assert from '../../lib/assert.js';
import fs from 'fs';
import library from './module_library.js';
import {Layout} from './layout.js';

export class PlaylistLoader {

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
    return RJSON.parse(playlistConfig);
  }

  /** Parses a playlist JSON object into a list of Layouts. */
  parsePlaylist(config) {
    // TODO(applmak): If module is specified on the command-line, ignore whatever is set in the playlist.
    return config.playlist.map((layout) => {
      return new Layout({
        modules: this.getModulesForLayout_(layout, config.collections),
        moduleDuration: this.flags.module_duration || layout.moduleDuration,
        duration: this.flags.layout_duration || layout.duration,
      });
    });
  }
}
