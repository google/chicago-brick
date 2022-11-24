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

// import { LoadFromDriveClientStrategy } from "./load_from_drive_client.ts";
// import { LoadFromYouTubeClientStrategy } from "./load_from_youtube.ts";
// import { LoadFromFlickrClientStrategy } from "./load_from_flickr.ts";
import { LoadLocalClientStrategy } from "./load_local_client.ts";
import { FullscreenDisplayStrategyClient } from "./fullscreen_display_client.ts";
import { Surface } from "../../client/surface/surface.ts";
import { Client } from "../../client/modules/module_interface.ts";
import { easyLog } from "../../lib/log.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { DisplayConfig, LoadConfig } from "./interfaces.ts";
import {
  ClientDisplayStrategy,
  ClientLoadStrategy,
} from "./client_interfaces.ts";
import { WS } from "../../lib/websocket.ts";
import { LoadFromFlickrClientStrategy } from "./load_from_flickr_client.ts";
import { LoadYouTubeClientStrategy } from "./load_from_youtube_client.ts";
import { LoadFromDriveClientStrategy } from "./load_from_drive_client.ts";

const log = easyLog("slideshow");

export function load(wallGeometry: Polygon, network: WS) {
  function parseClientLoadStrategy(
    loadConfig: LoadConfig,
    surface: Surface,
    abortSignal: AbortSignal,
  ): ClientLoadStrategy {
    if (loadConfig.drive) {
      return new LoadFromDriveClientStrategy(
        loadConfig.drive,
        network,
        abortSignal,
      );
    } else if (loadConfig.youtube) {
      return new LoadYouTubeClientStrategy(loadConfig.youtube, network);
    } else if (loadConfig.local) {
      return new LoadLocalClientStrategy(
        loadConfig.local,
        surface,
        network,
      );
    } else if (loadConfig.flickr) {
      return new LoadFromFlickrClientStrategy();
    }
    throw new Error(
      "Could not parse display config: " + Object.keys(loadConfig).join(", "),
    );
  }

  function parseClientDisplayStrategy(
    displayConfig: DisplayConfig,
    loadStrategy: ClientLoadStrategy,
    surface: Surface,
  ) {
    if (displayConfig.fullscreen) {
      return new FullscreenDisplayStrategyClient(
        displayConfig.fullscreen,
        loadStrategy,
        network,
        surface,
      );
    }
    throw new Error(
      `Could not parse load config: ${Object.keys(displayConfig).join(", ")}`,
    );
  }

  class SlideshowClient extends Client {
    loadStrategy?: ClientLoadStrategy;
    displayStrategy?: ClientDisplayStrategy;
    readonly abortController = new AbortController();
    willBeShownSoon(container: HTMLElement) {
      this.surface = new Surface(container, wallGeometry);
      return new Promise<void>((resolve) => {
        log("Waiting for network init...");
        network.once("slideshow:init_res", (config) => {
          log("Init received.");
          this.loadStrategy = parseClientLoadStrategy(
            config.load,
            this.surface!,
            this.abortController.signal,
          );
          this.displayStrategy = parseClientDisplayStrategy(
            config.display,
            this.loadStrategy,
            this.surface!,
          );
          resolve();
        });
        network.send("slideshow:init");
      });
    }
    finishFadeOut() {
      this.abortController.abort();
      this.surface?.destroy();
    }
    draw(time: number, delta: number) {
      this.displayStrategy?.draw(time, delta);
    }
  }

  return { client: SlideshowClient };
}
