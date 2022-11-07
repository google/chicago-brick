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

import { ContentId, FullscreenDisplayConfig } from "./interfaces.ts";
import { ContentBag } from "./interfaces.ts";
import {
  ServerDisplayStrategy,
  ServerLoadStrategy,
} from "./server_interfaces.ts";
import { TypedWebsocketLike } from "../../lib/websocket.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { Point } from "../../lib/math/vector2d.ts";
import * as path from "https://deno.land/std@0.132.0/path/mod.ts";
import * as time from "../../lib/adjustable_time.ts";
import { easyLog } from "../../lib/log.ts";
import { makeTempDir } from "../../server/util/temp_directory.ts";
import * as wallGeometry from "../../server/util/wall_geometry.ts";

const log = easyLog("slideshow:fullscreen");

export class FullscreenServerDisplayStrategy implements ServerDisplayStrategy {
  newContentArrived: () => void = () => {};
  readonly contentReadyPromise = new Promise<void>((resolve) => {
    this.newContentArrived = resolve;
  });

  // The time we last chose new content.
  lastUpdate = 0;

  // If we are in pre-split mode, we have a single 'global' playing content. Remember that id here.
  globalContentId: ContentId | undefined = undefined;

  /** The offset into the content to walk through next sequentially. */
  nextContentIndex = 0;

  // If there are any late-comers to the party (like a refresh in the middle of our period), remember
  // the content we picked for each screen.
  readonly offsetToContentMapping = new Map<string, ContentId>();

  /** The next time the content on the wall should change at. */
  nextDeadline = 0;

  constructor(
    readonly config: FullscreenDisplayConfig,
    readonly loadStrategy: ServerLoadStrategy,
    readonly contentBag: ContentBag,
    readonly network: ModuleWSS,
    readonly initialDeadline: number,
  ) {
    this.nextDeadline = initialDeadline;
    // Tell the clients about content when it arrives.
    network.on(
      "slideshow:fullscreen:content_req",
      async (virtualOffset, socket) => {
        await this.contentReadyPromise;
        this.sendContentToClient(virtualOffset, socket);
      },
    );
  }
  contentEnded(): void {
    // When content ends, we don't do anything, because we let the period restart things.
  }
  async splitGlobalContent() {
    if (!this.config.split) {
      throw new Error("Asked to split content when config is not set to split");
    }
    if (!this.globalContentId) {
      throw new Error("No global content requested on split");
    }

    // Rather than spending my precious local JS CPU to do this, we'll use a different
    // tool (imagemagick). Imagemagick lets us convert our single content into MxN tiles.
    // Then, we can rename these into the presplit format and put them into the temporary
    // directory.

    // 0) Figure out the current MxN.
    // Here's one approach using the current set of clients.
    // const rect = new Polygon([...clients.keys()]).extents;
    // This might not work if the clients aren't ready.
    // Here's another approach using the wall geometry, but hardcodes HD size.
    // TODO(applmak): Figure something out.
    const rect = wallGeometry.getGeo().extents.scale(1 / 1920, 1 / 1080);
    log(
      `Splitting ${this.globalContentId.id}: Clients are currently occupying ${rect.w}x${rect.h}`,
    );

    // Make a temp directory
    const temp = await makeTempDir(this.globalContentId.id);
    log(`Splitting ${this.globalContentId.id}: Created temp ${temp}`);

    // 1) Split the content into MxN tiles.
    log(`Splitting ${this.globalContentId.id}: Downloading file...`);
    // We need to download it locally.
    const bytes = await this.loadStrategy.getBytes(this.globalContentId);
    const tempFilePath = path.join(temp, this.globalContentId.id);
    log(`Splitting ${this.globalContentId.id}: File path: ${tempFilePath}`);
    await Deno.writeFile(tempFilePath, bytes);
    this.globalContentId.id = tempFilePath;

    const command = [
      "convert",
      this.globalContentId.id,
      "-crop",
      `${rect.w}x${rect.h}@`,
      "+repage",
      "+adjoin",
      path.join(temp, "%d.png"),
    ];
    await Deno.run({ cmd: command }).status();
    log(`Splitting ${this.globalContentId.id}: Invoked imagemagick.`);

    // 2) Rename the content into the temp folder.
    const promises = [];
    for (let i = 0; i < rect.w * rect.h; ++i) {
      const x = i % rect.w;
      const y = Math.floor(i / rect.w);
      const cmd = [
        "mv",
        path.join(temp, `${i}.png`),
        path.join(temp, `r${y}c${x}.png`),
      ];
      promises.push(Deno.run({ cmd }).status());
    }
    await promises;
    log(
      `Splitting ${this.globalContentId.id}: Moved temp files to final locations.`,
    );

    // Replace the global content id with the path to the local file and mark the content as local.
    this.globalContentId.id = `/tmp/${path.basename(temp)}|.png`;
    this.globalContentId.local = true;
    log(`New content id: ${this.globalContentId.id}`);

    // Everything is split!
  }
  async chooseNewGlobalContent() {
    await this.contentReadyPromise;
    const possibleContent = new Set<ContentId>();
    if (this.config.split) {
      // In split mode, we assume that every piece of content tiles the whole wall.
      for (const contentId of this.contentBag.contentIds) {
        possibleContent.add(contentId);
      }
    } else {
      for (const contentId of this.contentBag.contentIds) {
        possibleContent.add({
          id: path.dirname(contentId.id) + "|" + path.extname(contentId.id),
          width: contentId.width,
          height: contentId.height,
        });
      }
    }

    if (this.config.shuffle) {
      this.globalContentId = random.pick([...possibleContent]);
    } else {
      this.globalContentId = [...possibleContent][this.nextContentIndex];
      this.nextContentIndex = (this.nextContentIndex + 1) %
        possibleContent.size;
    }

    if (this.config.split) {
      await this.splitGlobalContent();
    }

    this.nextDeadline = time.now();
  }
  async sendContentToClient(offset: Point, socket: TypedWebsocketLike) {
    // Now, depending on the config, select the right content.
    if (this.config.presplit || this.config.split) {
      if (!this.globalContentId) {
        await this.chooseNewGlobalContent();
      }
      if (!this.globalContentId) {
        log.error(`Global content not ready, but asked to display some.`);
        return;
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
        if (this.config.shuffle) {
          chosenId = random.pick(this.contentBag.contentIds);
        } else {
          chosenId = this.contentBag.contentIds[this.nextContentIndex];
          this.nextContentIndex = (this.nextContentIndex + 1) %
            this.contentBag.contentIds.length;
        }
        this.offsetToContentMapping.set(
          `${offset.x},${offset.y}`,
          chosenId,
        );
      }

      if (!chosenId) {
        log.error(
          `Content not ready for screen ${offset.x},${offset.y}, but asked to display some.`,
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
        log("Period expired. Choosing new content.");
        this.nextDeadline = time + 5000;
        if (this.config.presplit || this.config.split) {
          // Update _all_ the content.
          this.chooseNewGlobalContent();
          // Tell all the clients to update at a specific time. Give them 5 seconds.
          for (const [offset, socket] of this.network.clients()) {
            this.sendContentToClient(offset, socket);
          }
        } else {
          // Pick a random client. Remove its cached content.
          const clients = this.network.clients();
          if (clients.size) {
            const clientOffset = random.pick([...clients.keys()]);
            if (clientOffset) {
              this.offsetToContentMapping.delete(
                `${clientOffset.x},${clientOffset.y}`,
              );
              this.sendContentToClient(
                clientOffset,
                clients.get(clientOffset)!,
              );
            }
          } else {
            log("No clients yet registered. Waiting for the next period");
          }
        }
        this.lastUpdate = time;
      }
    }
  }
}
