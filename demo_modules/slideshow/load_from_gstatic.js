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
const interfaces = require('demo_modules/slideshow/interfaces');
const serverRequire = require('lib/server_require');
const assert = require('lib/assert');

// LOAD FROM GSTATIC STRATEGY
// Here, we specify the server & client strategies that can load images gstatic.
// We assume the specified host serves up a list of URLs on gstatic, and use
// the normal gstatic params to control sizing.
// Config:
//   url: string - The url that contains the list of images to show.
class LoadFromGstaticServerStrategy extends interfaces.ServerLoadStrategy {
  constructor(config) {
    super();
    this.config = config;
  }
  init() {
    return Promise.resolve();
  }
  loadMoreContent() {
    const fetch = serverRequire('node-fetch');
    return fetch(this.config.url).then(response => {
      if (!response.ok) {
        throw new Error('Gstatic query failed with status: ' + response.status + ': ' + response.statusText);
      }
      
      return response.json().then(images => {
        if (!images.length) {
          debug('Invalid gstatic query response!', images);
          throw new Error('Invalid gstatic query response!');
        }
      
        // Request a higher-resolution image from gstatic.
        let content = images.map(i => i.image + '=s1200-rw');
        debug('Downloaded ' + content.length + ' more content ids.');
        return {content};
      });
    }, (error) => {
      debug('Failed to download gstatic content! Delay a bit...');
      return Promise.delay(Math.random() * 4000 + 1000).then(() => this.loadMoreContent());
    });
  }
  serializeForClient() {
    return {gstatic: this.config};
  }
}

class LoadFromGstaticClientStrategy extends interfaces.ClientLoadStrategy {
  constructor(config) {
    super();
    this.config = config;
  }
  loadContent(url) {
    return new Promise((resolve, reject) => {
      var img = document.createElement('img');
      img.src = url;
      // Don't report that we've loaded the image until onload fires.
      img.addEventListener('load', () => resolve(img));
      img.addEventListener('error', () => reject(new Error));
    });
  }
}

module.exports = {
  Server: LoadFromGstaticServerStrategy,
  Client: LoadFromGstaticClientStrategy
};
