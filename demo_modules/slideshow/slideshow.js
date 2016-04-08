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

const googleapis = require('googleapis');
const assert = require('assert');
const _ = require('underscore');

// DISPATCH TABLES
// These methods convert a load or display config to specific server or client
// strategies. New strategies should be added to these methods.
let parseServerLoadStrategy = (loadConfig) => {
  if (loadConfig.drive) {
    return new LoadFromDriveServerStrategy(loadConfig.drive);
  }
  throw new Error('Could not parse load config: ' + Object.keys(loadConfig).join(', '));
};

let parseClientLoadStrategy = (loadConfig) => {
  if (loadConfig.drive) {
    return new LoadFromDriveClientStrategy(loadConfig.drive);
  }
  throw new Error('Could not parse display config: ' + Object.keys(loadConfig).join(', '));
};

let parseServerDisplayStrategy = (displayConfig) => {
  if (displayConfig.static) {
    return new StaticServerDisplayStrategy(displayConfig.static);
  }
  throw new Error('Could not parse load config: ' + Object.keys(displayConfig).join(', '));
};

let parseClientDisplayStrategy = (displayConfig) => {
  if (displayConfig.static) {
    return new StaticClientDisplayStrategy(displayConfig.static);
  }
  throw new Error('Could not parse load config: ' + Object.keys(displayConfig).join(', '));
};

// INTERFACES
// Here, we specify the interfaces for the load and display strategies. There is
// a separate interface for the server and the client.
class ServerLoadStrategy {
  init() {
    // Return a promise when initialization is complete.
    return Promise.resolve();
  }
  loadMoreContent(opt_paginationToken) {
    // Return a promise of a result with the following properties:
    //  - hasMoreContent: True, if the loader has more content to download.
    //  - paginationToken: An opaque token that will be passed to the next
    //    invocation of loadMoreContent is hasMoreContent is true.
    //  - content: An array of content, suitable for transmission to the client.
    return Promise.resolve([]);
  }
  serializeForClient() {
    // Return JSON that can be transmitted to the client and can instantiate
    // the strategy there.
    return {};
  }
}

class ClientLoadStrategy {
  loadContent(content) {
    // Loads content specified by the content id. The parameter comes from the 
    // server version of this strategy by way of the display strategy. The
    // promise is expected to resolve to an Element.
    return Promise.resolve();
  }  
}

class ServerDisplayStrategy {
  init() {
    // Return a promise when initialization is complete.
    return Promise.resolve();
  }
  tick(time, delta) {
    // Coordinate with the clients about what should be shown.
  }
  newContent(content) {
    // A notification from the load strategy that new content has been
    // discovered. The parameter is an array of content identifiers.
  }
  serializeForClient() {
    // Return JSON that can be transmitted to the client and can instantiate
    // the strategy there.
    return {};
  }
}

class ClientDisplayStrategy {
  init(surface, loadStrategy) {
    // The surface on which the strategy should draw, and the client-side load
    // strategy, which is invoked when new content is downloaded.
  }
  draw(time, delta) {
    // Update the surface with the content.
  }
}

// LOAD FROM DRIVE STRATEGY
// Here, we specify the server & client strategies that can load images from a
// drive folder passed in the config. The drive folder should be shared
// publicly or with the appropriate credentials.
class LoadFromDriveServerStrategy extends ServerLoadStrategy {
  constructor(config) {
    super();
    this.config = config;
    
    // Drive client API v2.
    this.driveClient = null;
  }
  init() {
    // Get an authenticated API. When init's promise is resolved, we succeeded.
    return googleapis.getAuthenticatedClient().then((client) => {
      debug('Initialized Drive Client.');
      this.config.credentials = client.credentials;
      this.driveClient = client.googleapis.drive('v2');
    }, (e) => {
      throw new Error('Error initializing Drive Client', e);
    });
  }
  loadMoreContent(opt_paginationToken) {
    return new Promise((resolve, reject) => 
      this.driveClient.children.list({
        folderId: this.config.folderId,
        maxResults: 1000,
        pageToken: opt_paginationToken
      }, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      })
    ).then((response) => {
      debug('Downloaded ' + response.items.length + ' more content ids.');
      return {
        content: response.items.map((i) => i.id),
        hasMoreContent: !!response.nextPageToken,
        paginationToken: response.nextPageToken
      };
    }, (error) => {
      debug('Failed to download more drive content! Delay a bit...');
      return Promise.delay(Math.random() * 4000 + 1000).then(() => this.loadMoreContent(opt_paginationToken));
    });
  }
  serializeForClient() {
    return {drive: this.config};
  }
}

class LoadFromDriveClientStrategy extends ClientLoadStrategy {
  constructor(config) {
    super();
    this.config = config;
  }
  loadContent(fileId) {
    const API_BASE_URL = 'https://www.googleapis.com/drive/v2';
    
    let fetchImage = () => {
      return fetch(`${API_BASE_URL}/files/${fileId}?alt=media`, {
        headers: new Headers({
          'Authorization': 'Bearer ' + this.config.credentials.access_token
        })
      }).then((res) => {
        if (res.ok) {
          return res;
        }
        debug('Failed to load! Retrying...');
        // wait a random amount of time between 1000 and 5000 ms.
        return Promise.delay(Math.random() * 4000 + 1000).then(() => fetchImage());
      });
    };
    
    return fetchImage()
      .then((resp) => resp.blob())
      .then((blob) => URL.createObjectURL(blob))
      .then((url) => {
        return new Promise((resolve, reject) => {
          var img = document.createElement('img');
          img.src = url;
          // Don't report that we've loaded the image until onload fires.
          img.addEventListener('load', () => resolve(img));
          img.addEventListener('error', () => reject(new Error));
        });
      });
  }
}

// STATIC DISPLAY STRATEGY
// This display strategy shows a single element per screen, updating at a rate
// specified in the config. We wait for the corresponding element to load 
// before we show it.
class StaticServerDisplayStrategy extends ServerDisplayStrategy {
  constructor(config) {
    super();
    this.config = config;
    
    // Content ids from the server load strategy.
    this.content = [];
    
    // Keep track of content indices. When our content array's length doesn't
    // match the length of this array, add the new indices to this array.
    this.nextContentIndices = [];
    
    // The time we last updated a display.
    this.lastUpdate = 0;
    
    let contentHasArrived = new Promise((resolve, reject) => {
      this.signalContentArrived = resolve;
    });
    
    // Tell the clients about content when it arrives.
    network.on('connection', (socket) => {
      contentHasArrived.then(() => {
        this.chooseSomeContent(socket);
        return content;
      });
    }); 
  }
  init() {
    // Return a promise when initialization is complete.
    return Promise.resolve();
  }
  chooseSomeContent(socket) {
    assert(this.nextContentIndices.length, 'No content to select from!');
    // Choose the next one.
    let index = this.nextContentIndices.shift();
    
    debug('Sending content index ' + index + ' to client.');
    
    // Send it to the specified client.
    socket.emit('display:content', this.content[index]);
    // Add this index back to the end of the list of indices.
    this.nextContentIndices.push(index);
  }
  newContent(content) {
    this.content.push(...content);
    // We've loaded new content. Generate a list of new indices and shuffle.
    let newIndices = _.shuffle(_.range(this.nextContentIndices.length, content.length));
    // Add the content indices.
    this.nextContentIndices.push(...newIndices);

    this.signalContentArrived();
  }
  tick(time, delta) {
    // If there's no content to show, just stop.
    if (!this.content.length) {
      return;
    }
    
    // Otherwise, tell a specific client to show a specific bit of content.
    if (time - this.lastUpdate >= this.config.period) {
      // Pick a random client.
      let client = _.sample(network.getClientsInRect(wallGeometry.extents));
      if (client) {
        this.chooseSomeContent(client.socket);
      }
      this.lastUpdate = time;
    }
  }
  serializeForClient() {
    return {'static': this.config};
  }
}

class StaticClientDisplayStrategy extends ClientDisplayStrategy {
  init(surface, loadStrategy) {
    this.surface = surface;
    network.on('display:content', (c) => {
      loadStrategy.loadContent(c).then((content) => {
        content.style.position = 'absolute';
        content.style.top = 0;
        content.style.left = 0;
        content.style.width = '100%';
        content.style.height = '100%';
        
        // Clear surface.
        while (this.surface.container.firstChild) {
          this.surface.container.removeChild(this.surface.container.firstChild);
        }
        // Add content.
        this.surface.container.appendChild(content);
      });
    })
  }
}

// MODULE DEFINTIONS
class ImageServer extends ServerModuleInterface {
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
      loadingComplete.then(() => socket.emit('init', {
        load: this.loadStrategy.serializeForClient(),
        display: this.displayStrategy.serializeForClient()
      }));
    });
  }
  tick(time, delta) {
    this.displayStrategy.tick(time, delta);
  }
}

class ImageClient extends ClientModuleInterface {
  willBeShownSoon(container, deadline) {
    this.surface = new Surface(container, wallGeometry);
    this.initedPromise = new Promise((resolve, reject) => {
      network.once('init', (config) => {
        this.loadStrategy = parseClientLoadStrategy(config.load);
        this.displayStrategy = parseClientDisplayStrategy(config.display);
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