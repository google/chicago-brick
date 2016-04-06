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

let parseServerLoadStrategy = (loadConfig) => {
  if (loadConfig.drive) {
    return new LoadFromDriveServerStrategy(loadConfig.drive);
  }
  throw new Error('Could not parse load config: ' + Object.keys(loadConfig).join(', '));
};

let parseServerDisplayStrategy = (displayConfig) => {
  if (displayConfig.static) {
    return new StaticServerDisplayStrategy(displayConfig.static);
  }
  throw new Error('Could not parse display config: ' + Object.keys(displayConfig).join(', '));
};

let parseClientLoadStrategy = (loadConfig) => {
  if (loadConfig.drive) {
    return new LoadFromDriveClientStrategy(loadConfig.drive);
  }
  throw new Error('Could not parse load config: ' + Object.keys(loadConfig).join(', '));
};

let parseClientDisplayStrategy = (displayConfig) => {
  if (displayConfig.static) {
    return new StaticClientDisplayStrategy(displayConfig.static);
  }
  throw new Error('Could not parse load config: ' + Object.keys(displayConfig).join(', '));
};


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
    // Loads content on the client sent from the server. Returns a promise that
    // is resolved when the content is finished loading.
    return Promise.resolve();
  }  
}

class ServerDisplayStrategy {
  init() {
    // Return a promise when initialization is complete.
    return Promise.resolve();
  }
  tick(content, time, delta) {
    // Tell the clients about what to display.
  }
  serializeForClient() {
    // Return JSON that can be transmitted to the client and can instantiate
    // the strategy there.
    return {};
  }
}

class ClientDisplayStrategy {
  display(container, loadedContent) {
    // Display the thing.
  }
}

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
        var img = document.createElement('img');
        img.style.position = 'absolute';
        img.style.top = 0;
        img.style.left = 0;
        img.style.width = '100%';
        img.style.height = '100%';
        img.src = url;
        return img;
      });
  }
}

class StaticServerDisplayStrategy extends ServerDisplayStrategy {
  constructor(config) {
    super();
    this.config = config;
    
    // Keep track of content indices. When our content array's length doesn't
    // match the length of this array, add the new indices to this array.
    this.nextContentIndices = [];
    
    // The time we last updated a display.
    this.lastUpdate = 0;
    
    let contentHasArrived = new Promise((resolve, reject) => {
      this.contentArrives = resolve;
    });
    network.on('connection', (socket) => {
      contentHasArrived.then((content) => {
        this.chooseSomeContent(content, socket);
        return content;
      });
    });
  }
  init() {
    // Return a promise when initialization is complete.
    return Promise.resolve();
  }
  chooseSomeContent(content, socket) {
    assert(this.nextContentIndices.length, 'No content to select from!');
    // Choose the next one.
    let index = this.nextContentIndices.shift();
    
    debug('Sending content index ' + index + ' to client.');
    
    // Send it to the specified client.
    socket.emit('content', content[index]);
    // Add this index back to the end of the list of indices.
    this.nextContentIndices.push(index);
  }
  tick(content, time, delta) {
    // If there's no content to show, just stop.
    if (!content || !content.length) {
      return;
    }
    
    assert(content.length >= this.nextContentIndices.length,
           'Whoa! Weird edge case: We never expect to unload any content!',
           content.length, this.nextContentIndices.length);
           
    if (content.length > this.nextContentIndices.length) {
      // We've loaded new content. Generate a list of new indices and shuffle.
      let newIndices = _.shuffle(_.range(this.nextContentIndices.length, content.length));
      // Add the content indices.
      this.nextContentIndices.push(...newIndices);
    }
    
    this.contentArrives(content);
    
    // Otherwise, tell a specific client to show a specific bit of content.
    if (time - this.lastUpdate >= this.config.period) {
      // Pick a random client.
      let client = _.sample(network.getClientsInRect(wallGeometry.extents));
      if (client) {
        this.chooseSomeContent(content, client.socket);
      }
      this.lastUpdate = time;
    }
  }
  serializeForClient() {
    return {'static': this.config};
  }
}

class StaticClientDisplayStrategy extends ClientDisplayStrategy {
  display(container, loadedContent) {
    // Assume loadedContent is an element...
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(loadedContent);
  }
}

class ImageServer extends ServerModuleInterface {
  constructor(config) {
    super();
    
    // The load strategy for this run of the module.
    this.loadStrategy = parseServerLoadStrategy(config.load);
    
    // The display strategy for this run of the module.
    this.displayStrategy = parseServerDisplayStrategy(config.display);
    
    // Content downloaded so far.
    this.content = [];
  }
  willBeShownSoon(deadline) {
    // Start the load strategy initing.
    let loadingComplete = Promise.all([
      this.displayStrategy.init(),
      this.loadStrategy.init().then(() => {
        let fetchContent = (opt_paginationToken) => {
          this.loadStrategy.loadMoreContent(opt_paginationToken).then((result) => {
            this.content.push(...result.content);
            debug('Total content count: ' + this.content.length);
            
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
    this.displayStrategy.tick(this.content, time, delta);
  }
}

class ImageClient extends ClientModuleInterface {
  willBeShownSoon(container, deadline) {
    this.surface = new Surface(container, wallGeometry);
    this.initedPromise = new Promise((startInit, reject) => {
      network.once('init', (config) => {
        this.loadStrategy = parseClientLoadStrategy(config.load);
        this.displayStrategy = parseClientDisplayStrategy(config.display);
        startInit();
      });
    });
    network.on('content', (content) => {
      this.initedPromise.then(() => {
        this.loadStrategy.loadContent(content).then(
          (loadedContent) => this.displayStrategy.display(container, loadedContent));
      });
    });
  }
}

register(ImageServer, ImageClient);