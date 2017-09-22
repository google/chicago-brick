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

define(function(require) {
  'use strict';
  const network = require('client/network/network');
  const debug = require('client/util/debug')('wall:clientlibs');

  // Map of loaded libs. Because libraries affect global state on the client,
  // once they have been loaded they won't be loaded again unless the browser is
  // restarted.
  const loaded = {};

	// Library configs. This will be updated by the server any time the playlist
  // is loaded. Combined with the loaded map, it will allow new libs to be
  // quickly picked up, but not reload on changes (without a browser refresh).
  let configs = {};

  network.whenReady.then(() => {
	  network.on('libraries', libraries => {
	    configs = _.indexBy(libraries, (cfg) => cfg.name);
	  });
  });

  function load(name) {
    if (loaded[name]) {
      // Already loaded.
      return;
    }

    const script = configs[name];
    if (!script) {
      debug('Unable to load library: ' + name);
      return;
    }

    var scriptElement = document.createElement("script");
    scriptElement.src = script.src;
    document.head.appendChild(scriptElement);
    loaded[name] = true;
  }

  return {load: load};
});
