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

import * as randomjs from "https://esm.sh/random-js@2.1.0";
const random = new randomjs.Random();

import { FullscreenDisplayConfig } from "./interfaces.ts";
import { ContentBag } from "./interfaces.ts";
import { ServerDisplayStrategy } from "./server_interfaces.ts";
import { TypedWebsocketLike } from "../../lib/websocket.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { Point } from "../../lib/math/vector2d.ts";
import * as path from "https://deno.land/std@0.132.0/path/mod.ts";
import * as time from "../../lib/adjustable_time.ts";

// FULLSCREEN DISPLAY STRATEGY
// This display strategy shows a single element per screen, updating at a rate
// specified in the config. We wait for the corresponding element to load
// before we show it.
// Messages:
//   display:init() - Sent by client when it is ready to receive content. This
//       synchonizes a race between content loading on the server and the
//       client being ready for that content.
//   display:content(opaqueContentBlob) - Sent by server to inform the client
//       of new content that has been loaded and that the client should begin
//       showing.
// Config:
//   period: number - Number of millliseconds that should elapse between the
//           server refreshing a random client's content. If this is 0 or
//           undefined, the content will never refresh.
export class FullscreenServerDisplayStrategy implements ServerDisplayStrategy {
  newContentArrived: () => void = () => {};
  readonly contentReadyPromise = new Promise<void>((resolve) => {
    this.newContentArrived = resolve;
  });

  // The time we last chose new content.
  lastUpdate = 0;

  // If we are in pre-split mode, we have a single 'global' playing content. Remember that id here.
  globalContentId = "";

  // If there are any late-comers to the party (like a refresh in the middle of our period), remember
  // the content we picked for each screen.
  readonly offsetToContentMapping = new Map<string, string>();

  /** The next time the content on the wall should change at. */
  nextDeadline = 0;

  constructor(
    readonly config: FullscreenDisplayConfig,
    readonly contentBag: ContentBag,
    readonly network: ModuleWSS,
    readonly initialDeadline: number,
  ) {
    this.nextDeadline = initialDeadline;
    // Tell the clients about content when it arrives.
    network.on("slideshow:fullscreen:content_req", (virtualOffset, socket) => {
      this.sendContentToClient(virtualOffset, socket);
    });
  }
  contentEnded(): void {
    // When content ends, we don't do anything, because we let the period restart things.
  }
  async chooseNewGlobalContent() {
    if (!this.config.presplit) {
      throw new Error(`Asked to choose global content is non-presplit mode`);
    }
    await this.contentReadyPromise;
    const possibleContent = new Set<string>();
    for (const contentId of this.contentBag.contentIds) {
      possibleContent.add(
        path.dirname(contentId) + "|" + path.extname(contentId),
      );
    }
    this.globalContentId = random.pick([...possibleContent]);
    this.nextDeadline = time.now();
  }
  async sendContentToClient(offset: Point, socket: TypedWebsocketLike) {
    // Now, depending on the config, select the right content.
    if (this.config.presplit) {
      if (!this.globalContentId) {
        await this.chooseNewGlobalContent();
      }
      socket.send(
        "slideshow:fullscreen:content",
        this.globalContentId,
        this.nextDeadline,
      );
    } else {
      let chosenId = this.offsetToContentMapping.get(
        `${offset.x},${offset.y}`,
      );
      if (!chosenId) {
        chosenId = random.pick(this.contentBag.contentIds);
        this.offsetToContentMapping.set(
          `${offset.x},${offset.y}`,
          chosenId,
        );
      }

      // Send it to the specified client.
      socket.send(
        "slideshow:fullscreen:content",
        chosenId,
        this.nextDeadline,
      );
    }
    // Otherwise... we have no content!
  }
  tick(time: number) {
    if (this.config.period) {
      // We should update the content every so often.
      if (time - this.lastUpdate >= this.config.period) {
        this.nextDeadline = time + 5000;
        if (this.config.presplit) {
          // Update _all_ the content.
          this.chooseNewGlobalContent();
          // Tell all the clients to update at a specific time. Give them 5 seconds.
          for (const [offset, socket] of this.network.clients()) {
            this.sendContentToClient(offset, socket);
          }
        } else {
          // Pick a random client.
          const clients = this.network.clients();
          const clientOffset = random.pick([...clients.keys()]);
          if (clientOffset) {
            this.sendContentToClient(clientOffset, clients.get(clientOffset)!);
          }
        }
        this.lastUpdate = time;
      }
    }
  }
}
