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

import LoadFromDriveStrategy from './load_from_drive_server.js';
import LoadFromYouTubePlaylistStrategy from './load_from_youtube.js';
import LoadLocalStrategy from './load_local.js';
import LoadFromFlickrStrategy from './load_from_flickr.js';
import FullscreenDisplayStrategy from './fullscreen_display_server.js';

import fetch from 'node-fetch';
import randomjs from 'random-js';
const random = new randomjs.Random();

export function load(debug, network, assert, wallGeometry) {
  // DISPATCH TABLES
  // These methods convert a load or display config to specific server or client
  // strategies. New strategies should be added to these methods.

  const deps = {debug, network, assert, wallGeometry};

  function parseServerLoadStrategy(loadConfig) {
    if (loadConfig.drive) {
      return new (LoadFromDriveStrategy(deps).Server)(loadConfig.drive);
    } else if (loadConfig.youtube) {
      return new (LoadFromYouTubePlaylistStrategy(deps).Server)(loadConfig.youtube);
    } else if (loadConfig.local) {
      return new (LoadLocalStrategy(deps).Server)(loadConfig.local);
    } else if (loadConfig.flickr) {
      return new (LoadFromFlickrStrategy({...deps, fetch}).Server)(loadConfig.flickr);
    }

    throw new Error('Could not parse load config: ' + Object.keys(loadConfig).join(', '));
  }

  function parseServerDisplayStrategy(displayConfig, contentFetcher) {
    if (displayConfig.fullscreen) {
      return new (FullscreenDisplayStrategy(deps).Server)(displayConfig.fullscreen, contentFetcher);
    }
    throw new Error('Could not parse load config: ' + Object.keys(displayConfig).join(', '));
  }

  // MODULE DEFINTIONS
  class ImageServer {
    constructor(config) {
      this.content = [];

      // The load strategy for this run of the module.
      this.loadStrategy = parseServerLoadStrategy(config.load);

      // The display strategy for this run of the module.
      this.displayStrategy = parseServerDisplayStrategy(config.display, this);
    }
    /**
     * What to do when new content is downloaded.
     */
    handleNewContent(content) {
      this.content.push(...random.shuffle(content));
    }
    /**
     * Asks the load strategy to load some content and also starts a loop to
     * load the rest of the content.
     */
    async startLoadingContent() {
      await this.loadStrategy.init();
      const firstResponse = await this.loadStrategy.loadMoreContent();
      this.handleNewContent(firstResponse.content);
      // Don't wait for any more content to download, but start downloading it.
      this.loadRemainingContent(firstResponse.paginationToken);
    }
    /**
     * Loads any remaining content starting with the specified paginationToken.
     */
    async loadRemainingContent(token) {
      while(token) {
        const response = await this.loadStrategy.loadMoreContent(token);
        this.handleNewContent(response.content);
        token = response.paginationToken;
      }
    }

    async chooseContent() {
      const ret = this.content.shift();
      debug('Selected', ret);
      this.content.push(ret);
      return ret;
    }

    async willBeShownSoon() {
      // Start the strategies initing.
      await this.startLoadingContent();

      // When the clients ask for the init, we tell them.
      network.on('req_init', (data, socket) => {
        socket.emit('init', {
          load: this.loadStrategy.serializeForClient(),
          display: this.displayStrategy.serializeForClient()
        });
      });
    }
    tick(time, delta) {
      this.displayStrategy.tick(time, delta);
    }
  }

  return {server: ImageServer};
}
