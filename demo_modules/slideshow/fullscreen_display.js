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

'use strict';
const debug = require('debug');
const _ = require('underscore');
const assert = require('lib/assert');
const wallGeometry = require('wallGeometry');
const network = require('network');

const interfaces = require('./interfaces');

// FULLSCREEN DISPLAY STRATEGY
// This display strategy shows a single element per screen, updating at a rate
// specified in the config. We wait for the corresponding element to load 
// before we show it.
// Messages:
//   display:init() - Sent by client when it is ready to receive content. This
//       synchonizes a race between content loading on the server and the
//       client being ready for that content.
//   display:content(opaqueContentBlob) - Sent by server to inform the client
//       of new content that has been loaded and that the client should begin 
//       showing.
// Config:
//   period: number - Number of millliseconds that should elapse between the
//           server refreshing a random client's content. If this is 0 or
//           undefined, the content will never refresh.
class FullscreenServerDisplayStrategy extends interfaces.ServerDisplayStrategy {
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
      socket.on('display:init', () => {
        contentHasArrived.then(() => {
          this.chooseSomeContent(socket);
        });
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
    
    if (this.config.period) {
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
  }
  serializeForClient() {
    return {'fullscreen': this.config};
  }
}

class FullscreenClientDisplayStrategy extends interfaces.ClientDisplayStrategy {
  constructor(config) {
    super();
    this.config_ = config;
  }
  init(surface, loadStrategy) {
    const logError = require('client/util/log').error(debug);
    this.content = null;
    network.emit('display:init');
    this.surface = surface;
    network.on('display:content', c => {
      let container = this.surface.container;
      let info = container.querySelector('#fullscreen-info');
      if (!info) {
        info = document.createElement('div');
        info.id = 'fullscreen-info';
        info.style.position = 'absolute';
        info.style.left = '0';
        info.style.right = '0';
        info.style.top = '0';
        info.style.bottom  = '0';
        info.style.color = 'white';
        info.style.font = 'bolder 18px monospace';
        container.appendChild(info);
      }
      info.textContent = `Loading "${c}..."`;
      
      loadStrategy.loadContent(c).then(content => {
        // One piece of content per client.
        this.content = content;
        let s = this.config_.image && this.config_.image.scale || 'stretch';
        this.surface.container.style.display = 'flex';
        this.surface.container.style.alignItems = 'center';
        this.surface.container.style.justifyContent = 'center';
        switch(s) {
          case 'stretch':
            content.style.position = 'absolute';
            content.style.top = 0;
            content.style.left = 0;
            content.style.width = '100%';
            content.style.height = '100%';
            break;
          case 'full':
            content.style.display = 'block';
            if (content.naturalWidth/this.surface.virtualRect.w >=
                content.naturalHeight/this.surface.virtualRect.h) {
              content.style.width = '100%';
            } else {
              content.style.height = '100%';
            }
        }
        
        // Clear surface.
        while (this.surface.container.firstChild) {
          this.surface.container.removeChild(this.surface.container.firstChild);
        }
        // Add content.
        this.surface.container.appendChild(content);
      }).catch(err => {
        info.innerHTML += '<br>';
        info.innerHTML += `<span style="color:red">Error! ${err}</span>`;
        logError(err);
      });
    });
  }
  draw(time, delta) {
    if (this.content && this.content.draw) {
      this.content.draw(time, delta);
    }
  }
}

module.exports = {
  Server: FullscreenServerDisplayStrategy,
  Client: FullscreenClientDisplayStrategy
};
