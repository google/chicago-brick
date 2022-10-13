/* Copyright 2019 Google Inc. All Rights Reserved.

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
import {delay} from '../../lib/promise.ts';
import {PromiseCache} from '../../lib/promise_cache.js';

import sharp from 'sharp';

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

      // Drive client API.
      this.driveClient = null;

      // In-flight cache: A cache for metadata in-flight.
      this.inflightCache = new PromiseCache;

      // In-flight content cache: A cache for content in-flight. Note that as
      // soon as the data is downloaded, it's removed from this cache.
      this.inflightContent = new Map;
    }
    async init() {
      const {getAuthenticatedClient} = await import('../../server/util/googleapis.js');
      // Get an authenticated API. When init's promise is resolved, we succeeded.
      const client = await getAuthenticatedClient();
      debug('Initialized Drive Client.');
      // TODO(applmak): Don't assign credentials to the config, which is
      // readable on the status page!
      this.config.credentials = client.credentials;
      this.driveClient = client.googleapis.drive('v3');
    }
    async loadMoreContent(opt_paginationToken) {
      let response;
      if (this.config.folderId) {
        try {
          response = await this.driveClient.files.list({
            q: `'${this.config.folderId}' in parents`,
            maxResults: 1000,
            pageToken: opt_paginationToken
          });
        } catch (e) {
          debug('Failed to download more drive content! Delay a bit...');
          debug.error(e);
          await delay(Math.random() * 4000 + 1000);
          return this.loadMoreContent(opt_paginationToken);
        }

        debug('Downloaded ' + response.data.files.length + ' more content ids.');
        return {
          content: response.data.files.map(i => ({fileId: i.id})),
          paginationToken: response.data.nextPageToken
        };
      } else if (this.config.fileId) {
        return {
          content: [{fileId: this.config.fileId}],
        };
      } else {
        throw new Error('Module does not specify how to load the items');
      }
    }
    async fetchFullContent(fileId) {
      debug(`Downloading media for ${fileId}`);
      const image = await this.driveClient.files.get({
        fileId,
        alt: 'media',
      }, {
        responseType: 'arraybuffer',
      });
      const {data} = image;
      debug(`Downloaded media for ${fileId}: ${data.byteLength}`);
      // Create a "buffer" view on data (an arraybuffer), so that sharp is happy.
      return Buffer.from(data);
    }
    async downloadFullContent(content, cache) {
      const {fileId} = content;

      // Check if we already have it cached.
      if (cache.has(fileId)) {
        debug(`Full content for ${fileId} is cached`);
        return cache.get(fileId);
      }
      // Check if we are already nabbing the original image.
      if (this.inflightContent.has(fileId)) {
        debug(`Full content for ${fileId} is being downloaded`);
        return await this.inflightContent.get(fileId);
      }
      // Try downloading the whole kit 'n' kaboodle.
      const promise = this.fetchFullContent(fileId);
      this.inflightContent.set(fileId, promise);
      const array = await promise;
      // Cache the image into the cache so we don't have to look this up again.
      cache.set(fileId, array);
      // Remove the promise from our cache so we don't retain this data.
      this.inflightContent.delete(fileId);
      return array;
    }
    async clipImage(content, clippingRect, cache) {
      const image = await this.downloadFullContent(content, cache);
      return await sharp(image)
        .extract({left: clippingRect.x, top: clippingRect.y, width: clippingRect.w, height: clippingRect.h})
        .png()
        .toBuffer();
    }
    async downloadContent(content, clippingRect, cache) {
      if (!clippingRect) {
        debug(`No clipping rect specified ${content.fileId}`);
        return await this.downloadFullContent(content, cache);
      }

      const {fileId} = content;
      const key = `${fileId} ${clippingRect.serialize()}`;

      // Check if we already have it cached.
      if (cache.has(key)) {
        debug(`Clipping region ${clippingRect.serialize()} for ${fileId} was cached`);
        return cache.get(key);
      }
      // Check if we are already creating a cropped form of this.
      if (this.inflightContent.has(key)) {
        debug(`Clipping region ${clippingRect.serialize()} for ${fileId} is being computed now`);
        return await this.inflightContent.get(key);
      }

      debug(`Clipping region ${clippingRect.serialize()} for ${fileId}`);
      const promise = this.clipImage(content, clippingRect, cache);
      this.inflightContent.set(key, promise);
      const clippedImage = await promise;
      debug(`Clipping region ${clippingRect.serialize()} for ${fileId} complete`);

      // Cache the cropped image into the cache so we don't have to look this up again.
      cache.set(key, clippedImage);

      // Remove the promise from our cache so we don't retain this data.
      this.inflightContent.delete(key);
      return clippedImage;
    }
    async fetchMetadata(content, cache) {
      const image = await this.downloadFullContent(content, cache);
      return await sharp(image).metadata();
    }
    async metadataForContent(content, cache) {
      if (!this.config.split) {
        // If we aren't set to split, we don't do any metadata fetching.
        return null;
      }

      const {inflightCache} = this;
      const {fileId} = content;
      // Maybe the caches have this?
      if (inflightCache.has(fileId)) {
        const metadata = inflightCache.get(fileId);
        debug(`Cached metadata for ${fileId}: ${JSON.stringify(metadata)}`);
        return metadata;
      }

      if (inflightCache.hasAsync(fileId)) {
        debug(`Cached metadata for ${fileId} is being fetched.`);
        return await inflightCache.getAsync(fileId);
      }

      debug(`Downloading media ${fileId} in order to calculate metadata...`);
      const promise = this.fetchMetadata(content, cache);
      inflightCache.setAsync(fileId, promise);
      const metadata = await promise;
      debug(`Calculated metadata for ${fileId}: ${metadata.width} x ${metadata.height}`);
      return inflightCache.get(fileId);
    }
    serializeForClient() {
      return {drive: this.config};
    }
  }

  return {
    Server: LoadFromDriveServerStrategy,
  };
}
