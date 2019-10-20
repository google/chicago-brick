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

import LoadFromDriveStrategy from './load_from_drive_client.js';
import LoadFromYouTubePlaylistStrategy from './load_from_youtube.js';
import LoadLocalStrategy from './load_local.js';
import LoadFromFlickrStrategy from './load_from_flickr.js';
import FullscreenDisplayStrategy from './fullscreen_display_client.js';
import {Surface} from '/client/surface/surface.js';

export function load(wallGeometry, debug, network, assert, asset) {
  // DISPATCH TABLES
  // These methods convert a load or display config to specific server or client
  // strategies. New strategies should be added to these methods.
  const deps = {wallGeometry, debug, network, assert, asset};

  let parseClientLoadStrategy = (loadConfig) => {
    if (loadConfig.drive) {
      return new (LoadFromDriveStrategy(deps).Client)(loadConfig.drive);
    } else if (loadConfig.youtube) {
      return new (LoadFromYouTubePlaylistStrategy(deps).Client)(loadConfig.youtube);
    } else if (loadConfig.local) {
      return new (LoadLocalStrategy(deps).Client)(loadConfig.local);
    } else if (loadConfig.flickr) {
      return new (LoadFromFlickrStrategy(deps).Client)(loadConfig.flickr);
    }
    throw new Error('Could not parse display config: ' + Object.keys(loadConfig).join(', '));
  };

  let parseClientDisplayStrategy = (displayConfig) => {
    if (displayConfig.fullscreen) {
      return new (FullscreenDisplayStrategy(deps).Client)(displayConfig.fullscreen);
    }
    throw new Error('Could not parse load config: ' + Object.keys(displayConfig).join(', '));
  };

  class ImageClient {
    async willBeShownSoon(container, deadline) {
      this.surface = new Surface(container, wallGeometry);
      return new Promise(resolve => {
        debug('Waiting for network init...');
        network.emit('req_init');
        network.once('init', config => {
          debug('Init received.');
          this.loadStrategy = parseClientLoadStrategy(config.load);
          this.displayStrategy = parseClientDisplayStrategy(config.display);
          this.loadStrategy.init(this.surface, deadline);
          this.displayStrategy.init(this.surface, this.loadStrategy);
          resolve();
        });
      });
    }
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }
    draw(time, delta) {
      if (this.displayStrategy) {
        this.displayStrategy.draw(time, delta);
      }
    }
  }

  return {client: ImageClient};
}
