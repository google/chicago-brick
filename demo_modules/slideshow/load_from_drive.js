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

// LOAD FROM DRIVE STRATEGY
// Here, we specify the server & client strategies that can load images from a
// drive folder passed in the config. The drive folder should be shared
// publicly or with the appropriate credentials.
// TODO(applmak): Make the server-side filter out things the client can't
// display.
// TODO(applmak): Maybe make the server-side smarter about subfolders so as to
// create collections that should play, rather than needing to change the config
// every time.
// Config:
//   folderId: string - Drive folder ID from which to retrieve files.
class LoadFromDriveServerStrategy extends interfaces.ServerLoadStrategy {
  constructor(config) {
    super();
    this.config = config;
    
    // Drive client API v2.
    this.driveClient = null;
  }
  init() {
    const googleapis = serverRequire('server/util/googleapis');
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

class LoadFromDriveClientStrategy extends interfaces.ClientLoadStrategy {
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
      }).then(res => {
        if (res.ok) {
          return res;
        }
        debug(`Failed to load! ${fileId} ${res.status} ${res.statusText}`);
      });
    };
    
    return fetchImage()
      .then(resp => resp.blob()
          .then(blob => ({blob, type: resp.headers.get('content-type')})))
      .then(({blob, type}) => ({url: URL.createObjectURL(blob), type}))
      .then(({url, type}) => {
        return new Promise((resolve, reject) => {
          if (type.indexOf('image') != -1) {
            var img = document.createElement('img');
            img.src = url;
            // Don't report that we've loaded the image until onload fires.
            img.addEventListener('load', () => resolve(img));
            img.addEventListener('error', () => reject(new Error));
          } else if (type.indexOf('video') != -1) {
            var video = document.createElement('video');
            video.src = url;
            video.autoplay = true;
            video.addEventListener('load', () => resolve(video));
            video.addEventListener('error', () => reject(new Error));
          } else {
            throw new Error('Unknown MIME type for drive file: ' + type);
          }
        });
      });
  }
}

module.exports = {
  Server: LoadFromDriveServerStrategy,
  Client: LoadFromDriveClientStrategy
};