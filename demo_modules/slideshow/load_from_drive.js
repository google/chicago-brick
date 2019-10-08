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
import {delay} from '../../lib/promise.js';

export default function({debug}) {

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
  //   fileId: string - Drive file ID that is the file to download.
  //       Can't be specified with folderId.
  class LoadFromDriveServerStrategy extends ServerLoadStrategy {
    constructor(config) {
      super();
      this.config = config;

      // Drive client API v2.
      this.driveClient = null;
    }
    async init() {
      const {getAuthenticatedClient} = await import('../../server/util/googleapis.js');
      // Get an authenticated API. When init's promise is resolved, we succeeded.
      const client = await getAuthenticatedClient();
      debug('Initialized Drive Client.');
      // TODO(applmak): Don't assign credentials to the config, which is
      // readable on the status page!
      this.config.credentials = client.credentials;
      this.driveClient = client.googleapis.drive('v2');
    }
    async loadMoreContent(opt_paginationToken) {
      let response;
      if (this.config.folderId) {
        try {
          response = await this.driveClient.children.list({
            folderId: this.config.folderId,
            maxResults: 1000,
            pageToken: opt_paginationToken
          });
        } catch (e) {
          debug('Failed to download more drive content! Delay a bit...');
          await Promise.delay(Math.random() * 4000 + 1000);
          return this.loadMoreContent(opt_paginationToken);
        }

        debug('Downloaded ' + response.data.items.length + ' more content ids.');
        return {
          content: response.data.items.map((i) => i.id),
          hasMoreContent: !!response.data.nextPageToken,
          paginationToken: response.data.nextPageToken
        };
      } else if (this.config.fileId) {
        return {
          content: [this.config.fileId],
          hasMoreContent: false,
          paginationToken: undefined,
        };
      } else {
        throw new Error('Module does not specify how to load the items');
      }
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
    async loadContent(fileId) {
      const API_BASE_URL = 'https://www.googleapis.com/drive/v2';

      let res;
      let timeout = Math.floor(1000 + Math.random() * 1000);
      for (let numTriesLeft = 5; numTriesLeft > 0; numTriesLeft--) {
        res = await fetch(`${API_BASE_URL}/files/${fileId}?alt=media`, {
          headers: new Headers({
            'Authorization': 'Bearer ' + this.config.credentials.access_token
          })
        });
        if (res.ok) {
          break;
        }
        debug(`Failed to load! ${fileId} ${res.status} ${res.statusText}`);
        if (res.status == 403) {
          // Probably rate-limited. To fix this, we'll attempt to download
          // again after a random, exponentially increasing time.
          debug(`Retrying after ${timeout} ms and ${numTriesLeft} tries left...`);
          await delay(timeout);
          timeout *= 2.0;
          timeout += Math.floor(Math.random * 1000);
        } else {
          break;
        }
      }
      if (!res.ok) {
        throw new Error(`Failed to download ${fileId}! ${res.status} ${res.statusTxt}`);
      }

      const type = res.headers.get('content-type');
      const size = res.headers.get('content-length');
      debug(`Downloading image (${type} size:${size})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (type.indexOf('image') != -1) {
        return await new Promise((resolve, reject) => {
          const img = document.createElement('img');
          img.src = url;
          // Don't report that we've loaded the image until onload fires.
          img.addEventListener('load', () => {
            URL.revokeObjectURL(url);
            resolve(img);
          });
          img.addEventListener('error', () => reject(new Error(`${type}, ${url}`)));
        });
      } else if (type.indexOf('video') != -1) {
        return await new Promise((resolve, reject) => {
          const video = document.createElement('video');
          video.src = url;
          video.autoplay = true;
          video.addEventListener('load', () => {
            URL.revokeObjectURL(url);
            resolve(video);
          });
          video.addEventListener('error', () => reject(new Error));
        });
      } else {
        throw new Error('Unknown MIME type for drive file: ' + type);
      }
    }
  }

  return {
    Server: LoadFromDriveServerStrategy,
    Client: LoadFromDriveClientStrategy
  };
}
