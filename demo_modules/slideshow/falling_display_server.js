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

import assert from '../../lib/assert.js';
import randomjs from 'random-js';
const random = new randomjs.Random();

export default function({debug, wallGeometry, network}) {
  // FALLING DISPLAY STRATEGY
  // Elements fall from the top of the wall to the bottom at the constant speed
  // 'gravity', spawing every 'spawnPeriod' seconds.
  // Messages:
  //   display:content(opaqueContentBlob) - Sent by server to inform the client
  //       of new content that has been loaded and that the client should begin
  //       showing.
  // Config:
  //   spawnPeriod: number - The number of seconds that should elapse between the
  //                server spawning another falling element.
  //   gravity: number - The speed that images should fall in pixels per second.
  class FallingServerDisplayStrategy extends ServerDisplayStrategy {
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
    }
    init() {
      // Return a promise when initialization is complete.
      return Promise.resolve();
    }
    chooseSomeContent(time) {
      assert(this.nextContentIndices.length, 'No content to select from!');
      // Choose the next one.
      let index = this.nextContentIndices.shift();

      debug('Sending content index ' + index + ' to client.');

      // Generate falling content.
      let fallingImage = {
        content: this.content[index],
        x: Math.random() * wallGeometry.extents.w,
        y: -2000,
        rx: Math.random() - 0.5,
        ry: Math.random() - 0.5,
        rz: Math.random() - 0.5,
        start: time
      };

      // Send it to all clients.
      network.emit('display:content', fallingImage);
      // Add this index back to the end of the list of indices.
      this.nextContentIndices.push(index);
    }
    newContent(content) {
      this.content.push(...content);
      // We've loaded new content. Generate a list of new indices and shuffle.
      let newIndices = random.shuffle(Array.from(
        {length: content.length - this.nextContentIndices.length},
        (v, k) => this.nextContentIndices.length + k));
      // Add the content indices.
      this.nextContentIndices.push(...newIndices);
    }
    tick(time) {
      // If there's no content to show, just stop.
      if (!this.content.length) {
        return;
      }

      // Otherwise, if it's time to show new content, do so.
      if (time - this.lastUpdate >= this.config.spawnPeriod * 1000) {
        this.chooseSomeContent(time);
        this.lastUpdate = time;
      }
    }
    serializeForClient() {
      return {'falling': this.config};
    }
  }

  return {
    Server: FallingServerDisplayStrategy,
  };
}
