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

import {ServerLoadStrategy} from './interfaces.js';

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

      // Wait until content is downloaded.
      this.content = await this.loadContent();
    }
    async contentForClient(client) {
      return this.content.filter(c => {
        // Either there's no limitation on the content, or it matches exactly.
        return !c.client || c.client.x == client.x && c.client.y == client.y;
      });
    }
    async loadContent() {
      const content = [];
      let response = {};
      do {
        response = await this.loadMoreContent(response.paginationToken);
        content.push(...response.content);
      } while (response.hasMoreContent);
      return content;
    }
    async loadMoreContent(opt_paginationToken) {
      if (this.config.folderId) {
        let response;
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
          content: response.data.items.map(i => ({fileId: i.id})),
          hasMoreContent: !!response.data.nextPageToken,
          paginationToken: response.data.nextPageToken
        };
      } else if (this.config.fileId) {
        return {
          content: [{fileId: this.config.fileId}],
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

  return {
    Server: LoadFromDriveServerStrategy,
  };
}
