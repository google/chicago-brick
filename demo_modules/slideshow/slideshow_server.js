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

/**
 * Displays images and videos on the wall in an interesting pattern. There are
 * many potential sources for content, and we use a strategy specified in the
 * config file to choose how to load them. There are also a variety of ways for
 * content to be displayed: we choose one for the entire duration of the module,
 * again specified in the config.
 *
 * This module unifies the various video- and image-playing modules we had at
 * the time this module was created.
 */

const register = require('register');
const ModuleInterface = require('lib/module_interface');
const debug = require('debug');
const network = require('network');

const LoadFromDriveStrategy = require('./load_from_drive');
const LoadFromYouTubePlaylistStrategy = require('./load_from_youtube');
const LoadLocalStrategy = require('./load_local');
const LoadFromFlickrStrategy = require('./load_from_flickr');

const FullscreenDisplayStrategy = require('./fullscreen_display');
const FallingDisplayStrategy = require('./falling_display');

// DISPATCH TABLES
// These methods convert a load or display config to specific server or client
// strategies. New strategies should be added to these methods.
let parseServerLoadStrategy = (loadConfig) => {
  if (loadConfig.drive) {
    return new LoadFromDriveStrategy.Server(loadConfig.drive);
  } else if (loadConfig.youtube) {
    return new LoadFromYouTubePlaylistStrategy.Server(loadConfig.youtube);
  } else if (loadConfig.local) {
    return new LoadLocalStrategy.Server(loadConfig.local);
  } else if (loadConfig.flickr) {
    return new LoadFromFlickrStrategy.Server(loadConfig.flickr);
  }

  throw new Error('Could not parse load config: ' + Object.keys(loadConfig).join(', '));
};

let parseServerDisplayStrategy = (displayConfig) => {
  if (displayConfig.fullscreen) {
    return new FullscreenDisplayStrategy.Server(displayConfig.fullscreen);
  } else if (displayConfig.falling) {
    return new FallingDisplayStrategy.Server(displayConfig.falling);
  }
  throw new Error('Could not parse load config: ' + Object.keys(displayConfig).join(', '));
};

// MODULE DEFINTIONS
class ImageServer extends ModuleInterface.Server {
  constructor(config) {
    super();

    // The load strategy for this run of the module.
    this.loadStrategy = parseServerLoadStrategy(config.load);

    // The display strategy for this run of the module.
    this.displayStrategy = parseServerDisplayStrategy(config.display);
  }
  willBeShownSoon(deadline) {
    // Start the load strategy initing.
    let loadingComplete = Promise.all([
      this.displayStrategy.init(),
      this.loadStrategy.init().then(() => {
        let fetchContent = (opt_paginationToken) => {
          this.loadStrategy.loadMoreContent(opt_paginationToken).then((result) => {
            this.displayStrategy.newContent(result.content);

            if (result.hasMoreContent) {
              fetchContent(result.paginationToken);
            }
          });
        };
        fetchContent();
      })
    ]);
    network.on('connection', (socket) => {
      let initHandler = () => socket.emit('init', {
        load: this.loadStrategy.serializeForClient(),
        display: this.displayStrategy.serializeForClient()
      });
      // Depending on when the client loads and we load, the client might send
      // the req_init before we are listening for it, or we might finish loading
      // and send our init event before the client is listening for it!
      // To fix this, we listen for a one-time event from the client, req_init,
      // which will cause us to send the init event. Then, we might send 1 or 2
      // init messages, and we leave it up to the client to not process it
      // twice.
      loadingComplete.then(initHandler);
      // If we get a note from the client that requests init, we don't want to
      // reply until we've inited.
      socket.once('req_init', () => loadingComplete.then(initHandler));
    });
    return loadingComplete;
  }
  tick(time, delta) {
    this.displayStrategy.tick(time, delta);
  }
}

register(ImageServer, null);
