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

import { ContentMetadata, ContentPage } from "./interfaces.ts";
import { delay } from "../../lib/promise.ts";
import { PromiseCache } from "../../lib/promise_cache.ts";
import {
  Drive,
  FileList,
  GoogleAuth,
} from "https://googleapis.deno.dev/v1/drive:v3.ts";
import * as credentials from "../../server/util/credentials.ts";
import {
  JWT,
  JWTInput,
} from "https://googleapis.deno.dev/_/base@v1/auth/jwt.ts";
import { easyLog } from "../../lib/log.ts";
import { WSSWrapper } from "../../server/network/websocket.ts";
import { WS } from "../../lib/websocket.ts";
import { SizeLimitedCache } from "../../lib/size_limited_cache.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import { ServerLoadStrategy } from "./server_interfaces.ts";

const log = easyLog("slideshow:drive");

export interface DriveConfig {
  /** The name of the credential file in the credentials dir. */
  credentialFileName: string;
  /** The id of the Google Drive folder that contains the content. */
  folderId?: string;
  /** The id of the Google Drive file that is the content. */
  fileId?: string;
  /** If true, if the module should automatically split the content to fix the screens. */
  split?: boolean;
}

interface DriveItem {
  fileId: string;
}

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
export class LoadFromDriveServerStrategy implements ServerLoadStrategy {
  readonly client: JWT;
  readonly creds: JWTInput;
  readonly drive: Drive;
  readonly inflightCache = new PromiseCache<string, ContentMetadata>();
  // In-flight content cache: A cache for content in-flight. Note that as
  // soon as the data is downloaded, it's removed from this cache.
  readonly inflightContent = new Map<string, Promise<Uint8Array>>();

  constructor(readonly config: DriveConfig, network: WSSWrapper) {
    this.creds = credentials.get(
      this.config.credentialFileName || "googleserviceaccountkey",
    ) as JWTInput;
    this.client = new GoogleAuth().fromJSON(this.creds);
    this.drive = new Drive(this.client);

    network.on("slideshow:drive:init", (socket: WS) => {
      socket.send("slideshow:drive:init_res", this.creds);
    });
  }
  async loadMoreContent(paginationToken?: string): Promise<ContentPage> {
    let response: FileList;
    if (this.config.folderId) {
      try {
        response = await this.drive.filesList({
          q: `'${this.config.folderId}' in parents`,
          pageToken: paginationToken,
        });
      } catch (e) {
        log("Failed to download more drive content! Delay a bit...");
        log.error(e);
        await delay(Math.random() * 4000 + 1000);
        return this.loadMoreContent(paginationToken);
      }

      log(`Downloaded ${response.files?.length} more content ids.`);
      return {
        contentIds: response.files?.map((i) => i.id!) || [],
        paginationToken: response.nextPageToken,
      };
    } else if (this.config.fileId) {
      return { contentIds: [this.config.fileId] };
    } else {
      throw new Error("Module does not specify how to load the items");
    }
  }
  async fetchFullContent(fileId: string) {
    log(`Downloading media for ${fileId}`);
    const image = await this.drive.filesGet(`${fileId}?alt=media`);
    // What is image even?
    console.log(image);
    // const { data } = image;
    // debug(`Downloaded media for ${fileId}: ${data.byteLength}`);
    // Create a "buffer" view on data (an arraybuffer), so that sharp is happy.
    return new Uint8Array(0);
  }
  async downloadFullContent(
    content: DriveItem,
    cache: SizeLimitedCache<string, Uint8Array>,
  ): Promise<Uint8Array> {
    const { fileId } = content;

    // Check if we already have it cached.
    if (cache.has(fileId)) {
      log(`Full content for ${fileId} is cached`);
      return cache.get(fileId)!;
    }
    // Check if we are already nabbing the original image.
    if (this.inflightContent.has(fileId)) {
      log(`Full content for ${fileId} is being downloaded`);
      return await this.inflightContent.get(fileId)!;
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
  async clipImage(
    content: DriveItem,
    clippingRect: Rectangle,
    cache: SizeLimitedCache<string, Uint8Array>,
  ) {
    const image = await this.downloadFullContent(content, cache);
    return image;
    // return await sharp(image)
    //   .extract({
    //     left: clippingRect.x,
    //     top: clippingRect.y,
    //     width: clippingRect.w,
    //     height: clippingRect.h,
    //   })
    //   .png()
    //   .toBuffer();
  }
  async downloadContent(
    content: DriveItem,
    clippingRect: Rectangle,
    cache: SizeLimitedCache<string, Uint8Array>,
  ): Promise<Uint8Array> {
    if (!clippingRect) {
      log(`No clipping rect specified ${content.fileId}`);
      return await this.downloadFullContent(content, cache);
    }

    const { fileId } = content;
    const key = `${fileId} ${clippingRect.serialize()}`;

    // Check if we already have it cached.
    if (cache.has(key)) {
      log(
        `Clipping region ${clippingRect.serialize()} for ${fileId} was cached`,
      );
      return cache.get(key)!;
    }
    // Check if we are already creating a cropped form of this.
    if (this.inflightContent.has(key)) {
      log(
        `Clipping region ${clippingRect.serialize()} for ${fileId} is being computed now`,
      );
      return await this.inflightContent.get(key)!;
    }

    log(`Clipping region ${clippingRect.serialize()} for ${fileId}`);
    const promise = this.clipImage(content, clippingRect, cache);
    this.inflightContent.set(key, promise);
    const clippedImage = await promise;
    log(
      `Clipping region ${clippingRect.serialize()} for ${fileId} complete`,
    );

    // Cache the cropped image into the cache so we don't have to look this up again.
    cache.set(key, clippedImage);

    // Remove the promise from our cache so we don't retain this data.
    this.inflightContent.delete(key);
    return clippedImage;
  }
  async fetchMetadata(
    content: DriveItem,
    cache: SizeLimitedCache<string, Uint8Array>,
  ): Promise<ContentMetadata> {
    const image = await this.downloadFullContent(content, cache);
    return { width: 0, height: 0 };
  }
  async metadataForContent(
    content: DriveItem,
    cache: SizeLimitedCache<string, Uint8Array>,
  ): Promise<ContentMetadata | null> {
    if (!this.config.split) {
      // If we aren't set to split, we don't do any metadata fetching.
      return null;
    }

    const { inflightCache } = this;
    const { fileId } = content;
    // Maybe the caches have this?
    if (inflightCache.has(fileId)) {
      const metadata = inflightCache.get(fileId)!;
      log(`Cached metadata for ${fileId}: ${JSON.stringify(metadata)}`);
      return metadata;
    }

    if (inflightCache.hasAsync(fileId)) {
      log(`Cached metadata for ${fileId} is being fetched.`);
      return await inflightCache.getAsync(fileId)!;
    }

    log(`Downloading media ${fileId} in order to calculate metadata...`);
    const promise = this.fetchMetadata(content, cache);
    inflightCache.setAsync(fileId, promise);
    const metadata = await promise;
    log(
      `Calculated metadata for ${fileId}: ${metadata.width} x ${metadata.height}`,
    );
    return inflightCache.get(fileId)!;
  }
}

declare global {
  interface EmittedEvents {
    "slideshow:drive:init": () => void;
    "slideshow:drive:init_res": (creds: JWTInput) => void;
  }
}
