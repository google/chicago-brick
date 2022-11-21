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

import { delay } from "../../lib/promise.ts";
import { ContentPage, FlickrLoadConfig } from "./interfaces.ts";
import { ServerLoadStrategy } from "./server_interfaces.ts";
import * as credentials from "../../server/util/credentials.ts";
import { assert } from "../../lib/assert.ts";
import { easyLog } from "../../lib/log.ts";

const log = easyLog("slideshow:flickr");

interface FlickrPhoto {
  url_l?: string;
}

export class LoadFromFlickrServerStrategy implements ServerLoadStrategy {
  constructor(readonly config: FlickrLoadConfig) {
    this.config = config;
  }
  getBytes(): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }

  async loadMoreContent(): Promise<ContentPage> {
    const apiKey = credentials.get("flickr") as string;
    assert(apiKey, "Missing Flickr API key!");
    const url = new URL("https://api.flickr.com/services/rest/");
    url.searchParams.set("method", "flickr.photos.search");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("nojsoncallback", "1");
    url.searchParams.set("text", this.config.query);
    url.searchParams.set("sort", "relevance");
    url.searchParams.set("per_page", "500");
    url.searchParams.set("extras", "url_l");

    let response;
    try {
      response = await fetch(url);
    } catch (e) {
      log.error("Failed to download flickr content! Delay a bit...", e);
      await delay(Math.random() * 4000 + 1000);
      return this.loadMoreContent();
    }
    if (!response.ok) {
      throw new Error(
        "Flickr query failed with status: " + response.status + ": " +
          response.statusText,
      );
    }

    const json = await response.json();
    if (!(json?.photos?.photo?.length > 0)) {
      log("Invalid flickr query response!", json);
      throw new Error("Invalid flickr query response!");
    }

    const photos = json.photos.photo as FlickrPhoto[];
    const contentIds = photos.map((p: FlickrPhoto) => p.url_l)
      .filter((u?: string) => u).map((u) => ({ id: u! }));
    log("Downloaded " + contentIds.length + " flickr images.");
    return { contentIds };
  }
}
