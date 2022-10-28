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
  // The time we last updated a display.
  lastUpdate = 0;

  constructor(
    readonly config: FullscreenDisplayConfig,
    readonly contentBag: ContentBag,
    readonly network: ModuleWSS,
  ) {
    // Tell the clients about content when it arrives.
    network.on("slideshow:fullscreen:content_req", (socket) => {
      this.sendContentToClient(socket);
    });
  }
  contentEnded(): void {
    // Choose new content for this content, maybe.
  }
  sendContentToClient(socket: TypedWebsocketLike) {
    const contentIds = this.contentBag.contentIds;
    // Now, depending on the config, select the right content.
    // TODO(applmak): Implement the tiled display one.
    if (contentIds.length) {
      const chosenId = random.pick(contentIds);

      // Send it to the specified client.
      socket.send("slideshow:fullscreen:content", chosenId);
    }
    // Otherwise... we have no content!
  }
  tick(time: number) {
    if (this.config.period) {
      // We should update the content every so often.
      if (time - this.lastUpdate >= this.config.period) {
        // Pick a random client.
        const client = random.pick(Object.values(this.network.clients()));
        if (client) {
          this.sendContentToClient(client);
        }
        this.lastUpdate = time;
      }
    }
  }
}
