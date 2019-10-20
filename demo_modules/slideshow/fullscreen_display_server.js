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

import {ServerDisplayStrategy} from './interfaces.js';

import randomjs from 'random-js';
const random = new randomjs.Random();

function pick(arr) {
  if (arr.length) {
    return random.pick(arr);
  }
  return null;
}

export default function({network}) {
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
  class FullscreenServerDisplayStrategy extends ServerDisplayStrategy {
    constructor(config, contentFetcher) {
      super();
      this.config = config;

      // The time we last updated a display.
      this.lastUpdate = 0;

      this.contentFetcher = contentFetcher;

      // Tell the clients about content when it arrives.
      network.on(
          'display:init', (data, socket) => this.sendContent(socket));
    }
    async sendContent(socket) {
      const content = await this.contentFetcher.chooseContent();
      // Send it to the specified client.
      socket.emit('display:content', content);
    }
    tick(time) {
      if (this.config.period) {
        // Otherwise, tell a specific client to show a specific bit of content.
        if (time - this.lastUpdate >= this.config.period) {
          // Pick a random client.
          let client = pick(Object.values(network.clients()));
          if (client) {
            this.sendContent(client.socket);
          }
          this.lastUpdate = time;
        }
      }
    }
    serializeForClient() {
      return {'fullscreen': this.config};
    }
  }

  return {
    Server: FullscreenServerDisplayStrategy,
  };
}
