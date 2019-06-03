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

import {ServerLoadStrategy, ClientLoadStrategy} from './interfaces.js';

export default function({debug, assert, fetch}) {
  // LOAD FROM FLICKR STRATEGY
  // Here, we specify the server & client strategies that can load images from a
  // flickr search. We require a valid API key to access the images, which is not
  // checked-in.
  // Config:
  //   query: string - The string to search for.
  class LoadFromFlickrServerStrategy extends ServerLoadStrategy {
    constructor(config) {
      super();
      this.config = config;
    }
    async init() {
      const credentials = await import('../../server/util/credentials.js');
      this.apiKey = credentials.get('flickr');
    }
    loadMoreContent() {
      assert(this.apiKey, 'Missing Flickr API key!');
      let query = new URLSearchParams({
        method: 'flickr.photos.search',
        api_key: this.apiKey,
        format: 'json',
        nojsoncallback: 1,
        text: this.config.query,
        sort: 'relevance',
        per_page: 500,
        extras: 'url_l',
      });
      let url = `https://api.flickr.com/services/rest/?${query}`;
      return fetch(url).then(response => {
        if (!response.ok) {
          throw new Error('Flickr query failed with status: ' + response.status + ': ' + response.statusText);
        }

        return response.json().then(json => {
          if (!(json.photos && json.photos.photo && json.photos.photo.length > 0)) {
            debug('Invalid flickr query response!', json);
            throw new Error('Invalid flickr query response!');
          }

          let content = json.photos.photo.map(p => p.url_l).filter(u => u);
          debug('Downloaded ' + content.length + ' more content ids.');
          return {content};
        });
      }, (error) => {
        debug('Failed to download flickr content! Delay a bit...');
        return Promise.delay(Math.random() * 4000 + 1000).then(() => this.loadMoreContent());
      });
    }
    serializeForClient() {
      return {flickr: this.config};
    }
  }

  class LoadFromFlickrClientStrategy extends ClientLoadStrategy {
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

  return {
    Server: LoadFromFlickrServerStrategy,
    Client: LoadFromFlickrClientStrategy
  };
}
