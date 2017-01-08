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
const _ = require('underscore');
const wallGeometry = require('wallGeometry');
const debug = require('debug');
const network = require('network');

const LoadFromDriveStrategy = require('demo_modules/slideshow/load_from_drive');
const LoadFromYouTubePlaylistStrategy = require('demo_modules/slideshow/load_from_youtube');
const LoadVideoStrategy = require('demo_modules/slideshow/load_video');
const LoadFromFlickrStrategy = require('demo_modules/slideshow/load_from_flickr');
const LoadFromGstaticStrategy = require('demo_modules/slideshow/load_from_gstatic');

const FullscreenDisplayStrategy = require('demo_modules/slideshow/fullscreen_display');
const FallingDisplayStrategy = require('demo_modules/slideshow/falling_display');

// DISPATCH TABLES
// These methods convert a load or display config to specific server or client
// strategies. New strategies should be added to these methods.
let parseServerLoadStrategy = (loadConfig) => {
  if (loadConfig.drive) {
    return new LoadFromDriveStrategy.Server(loadConfig.drive);
  } else if (loadConfig.youtube) {
    return new LoadFromYouTubePlaylistStrategy.Server(loadConfig.youtube);
  } else if (loadConfig.video) {
    return new LoadVideoStrategy.Server(loadConfig.video);
  } else if (loadConfig.flickr) {
    return new LoadFromFlickrStrategy.Server(loadConfig.flickr);
  } else if (loadConfig.gstatic) {
    return new LoadFromGstaticStrategy.Server(loadConfig.gstatic);
  }
  throw new Error('Could not parse load config: ' + Object.keys(loadConfig).join(', '));
};

let parseClientLoadStrategy = (loadConfig) => {
  if (loadConfig.drive) {
    return new LoadFromDriveStrategy.Client(loadConfig.drive);
  } else if (loadConfig.youtube) {
    return new LoadFromYouTubePlaylistStrategy.Client(loadConfig.youtube);
  } else if (loadConfig.video) {
    return new LoadVideoStrategy.Client(loadConfig.video);
  } else if (loadConfig.flickr) {
    return new LoadFromFlickrStrategy.Client(loadConfig.flickr);
  } else if (loadConfig.gstatic) {
    return new LoadFromGstaticStrategy.Client(loadConfig.gstatic);
  }
  throw new Error('Could not parse display config: ' + Object.keys(loadConfig).join(', '));
};

let parseServerDisplayStrategy = (displayConfig) => {
  if (displayConfig.fullscreen) {
    return new FullscreenDisplayStrategy.Server(displayConfig.fullscreen);
  } else if (displayConfig.falling) {
    return new FallingDisplayStrategy.Server(displayConfig.falling);
  }
  throw new Error('Could not parse load config: ' + Object.keys(displayConfig).join(', '));
};

let parseClientDisplayStrategy = (displayConfig) => {
  if (displayConfig.fullscreen) {
    return new FullscreenDisplayStrategy.Client(displayConfig.fullscreen);
  } else if (displayConfig.falling) {
    return new FallingDisplayStrategy.Client(displayConfig.falling);
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
      socket.once('req_init', initHandler);
    });
  }
  tick(time, delta) {
    this.displayStrategy.tick(time, delta);
  }
}

class ImageClient extends ModuleInterface.Client {
  willBeShownSoon(container, deadline) {
    const Surface = require('client/surface/surface');
    this.surface = new Surface(container, wallGeometry);
    this.initedPromise = new Promise((resolve, reject) => {
      debug('Waiting for network init...');
      network.emit('req_init');
      network.once('init', (config) => {
        this.loadStrategy = parseClientLoadStrategy(config.load);
        this.displayStrategy = parseClientDisplayStrategy(config.display);
        this.loadStrategy.init(this.surface, deadline);
        this.displayStrategy.init(this.surface, this.loadStrategy);
        resolve();
      });
    });
  }
  draw(time, delta) {
    if (this.displayStrategy) {
      this.displayStrategy.draw(time, delta);
    }
  }
}

register(ImageServer, ImageClient);