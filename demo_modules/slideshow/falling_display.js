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

'use strict';
const debug = require('debug');
const _ = require('underscore');
const assert = require('lib/assert');
const wallGeometry = require('wallGeometry');
const network = require('network');

const interfaces = require('./interfaces');

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
class FallingServerDisplayStrategy extends interfaces.ServerDisplayStrategy {
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
    let newIndices = _.shuffle(_.range(this.nextContentIndices.length, content.length));
    // Add the content indices.
    this.nextContentIndices.push(...newIndices);
  }
  tick(time, delta) {
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

class FallingClientDisplayStrategy extends interfaces.ClientDisplayStrategy {
  constructor(config) {
    super();
    this.config = config;
  }
  init(surface, loadStrategy) {
    this.surface = surface;

    // Because we are relying on CSS to do our transforms, we need to work in
    // the CSS space, not our virtual space.
    this.xscale = this.surface.container.offsetWidth / this.surface.virtualRect.w;
    this.yscale = this.surface.container.offsetHeight / this.surface.virtualRect.h;
    let wallWidth = this.surface.wallRect.w * this.xscale;
    let wallHeight = this.surface.wallRect.h * this.yscale;
    let xorigin = this.surface.virtualRect.x * this.xscale;
    let yorigin = this.surface.virtualRect.y * this.yscale;
    this.surface.container.style.perspective = '600px';    
    this.surface.container.style.perspectiveOrigin = `${wallWidth/2 - xorigin}px ${wallHeight/2 - yorigin}px`;
    this.content = [];
    
    network.on('display:content', c => {
      loadStrategy.loadContent(c.content).then(element => {
        c.element = element;
        // Set up content for animation.
        element.style.position = 'absolute';
        // element.style.transformStyle = 'preserve-3d';
//         element.style.transformOrigin = '50% 50%';
        this.surface.container.appendChild(element);
        this.content.push(c);
      });
    });
  }
  draw(time, delta) {
    this.content = this.content.filter((c) => {
      if (c.draw) {
        c.draw(time, delta);
      }
      
      let l = (time - c.start);
      let y = c.y + l * this.config.gravity / 1000;
      if (y > this.surface.wallRect.h + 2000) {
        c.element.remove();
        return false;
      }
      
      let rx = c.rx * l / 1000;
      let ry = c.ry * l / 1000;
      let rz = c.rz * l / 1000;
      
      // Transform to css space:
      let screenx = this.xscale * (c.x - this.surface.virtualRect.x);
      let screeny = this.yscale * (y - this.surface.virtualRect.y);
      
      c.element.style.transform = `translate3d(${screenx}px, ${screeny}px, 0px) rotateX(${rx}rad) rotateY(${ry}rad) rotateZ(${rz}rad)`;
      return true;
    });
  }
}

module.exports = {
  Server: FallingServerDisplayStrategy,
  Client: FallingClientDisplayStrategy
};
