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

/**
 * Displays images and videos on the wall in an interesting pattern. There are
 * many potential sources for content, and we use a strategy specified in the
 * config file to choose how to load them. There are also a variety of ways for
 * content to be displayed: we choose one for the entire duration of the module,
 * again specified in the config.
 *
 * This module unifies the various video- and image-playing modules we had at
 * the time this module was created.
 */

import { LoadLocalServerStrategy } from "./load_local_server.ts";
import { SizeLimitedCache } from "../../lib/size_limited_cache.ts";
import { Server } from "../../server/modules/module_interface.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import {
  Content,
  ContentBag,
  DisplayConfig,
  LoadConfig,
  SlideshowConfig,
} from "./interfaces.ts";
import { TypedWebsocketLike } from "../../lib/websocket.ts";
import {
  ServerDisplayStrategy,
  ServerLoadStrategy,
} from "./server_interfaces.ts";
import { FullscreenServerDisplayStrategy } from "./fullscreen_display_server.ts";
import { easyLog } from "../../lib/log.ts";

const log = easyLog("slideshow");

export function load(
  network: ModuleWSS,
) {
  // DISPATCH TABLES
  // These methods convert a load or display config to specific server or client
  // strategies. New strategies should be added to these methods.

  function parseServerLoadStrategy(loadConfig: LoadConfig): ServerLoadStrategy {
    // if (loadConfig.drive) {
    //   return new LoadFromDriveServerStrategy(loadConfig.drive, network);
    // } else if (loadConfig.youtube) {
    //   return new LoadFromYouTubeServerStrategy(loadConfig.youtube);
    // } else
    if (loadConfig.local) {
      return new LoadLocalServerStrategy(loadConfig.local);
    }
    //  else if (loadConfig.flickr) {
    //   return new LoadFromFlickrServerStrategy(loadConfig.flickr);
    // }

    throw new Error(
      "Could not parse load config: " + Object.keys(loadConfig).join(", "),
    );
  }

  function parseServerDisplayStrategy(
    displayConfig: DisplayConfig,
    contentBag: ContentBag,
    network: ModuleWSS,
    deadline: number,
  ): ServerDisplayStrategy {
    if (displayConfig.fullscreen) {
      return new FullscreenServerDisplayStrategy(
        displayConfig.fullscreen,
        contentBag,
        network,
        deadline,
      );
    }
    throw new Error(
      "Could not parse display config: " +
        Object.keys(displayConfig).join(", "),
    );
  }

  // MODULE DEFINTIONS
  class SlideshowServer extends Server implements ContentBag {
    /** The content loaded so far by the loading strategy. */
    readonly contentIds: string[] = [];
    /** The load strategy for this run of the module. */
    loadStrategy!: ServerLoadStrategy;
    /** The display strategy for this run of the module. */
    displayStrategy!: ServerDisplayStrategy;
    /**
     * Caches used by the loading strategy when clipping images. The exact
     * format of keys is determined by the loading strategy.
     */
    readonly contentCache = new SizeLimitedCache<string, Content>(2 ** 30);

    constructor(readonly config: SlideshowConfig) {
      super(config);
    }

    async willBeShownSoon(deadline: number) {
      this.loadStrategy = parseServerLoadStrategy(this.config.load);
      this.displayStrategy = parseServerDisplayStrategy(
        this.config.display,
        this,
        network,
        deadline,
      );

      log("Waiting for clients to init...");
      // When the clients ask for the init, we tell them.
      network.on("slideshow:init", (socket: TypedWebsocketLike) => {
        log("Client inited.");
        socket.send("slideshow:init_res", this.config);
      });

      network.on(
        "slideshow:content_ended",
        (content, offset, socket: TypedWebsocketLike) => {
          this.displayStrategy.contentEnded(content, offset, socket);
        },
      );

      // Start the strategies initing.
      await this.loadContent();
    }

    tick(time: number, delta: number) {
      this.displayStrategy.tick(time, delta);
    }

    /**
     * Loads any remaining content starting with the specified paginationToken.
     */
    async loadContent(token?: string) {
      do {
        const response = await this.loadStrategy.loadMoreContent(token);
        this.contentIds.push(...response.contentIds);
        this.displayStrategy.newContentArrived?.();
        token = response.paginationToken;
      } while (token);
      this.displayStrategy.allContentArrived?.();
    }
  }

  return { server: SlideshowServer };
}
