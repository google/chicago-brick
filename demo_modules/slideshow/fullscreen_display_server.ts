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
import { easyLog, enable } from "../../lib/log.ts";
import { makeTempDir } from "../../server/util/temp_directory.ts";
import * as wallGeometry from "../../server/util/wall_geometry.ts";

const log = easyLog("slideshow:fullscreen");

export class FullscreenServerDisplayStrategy implements ServerDisplayStrategy {
  newContentArrived: () => void = () => {};
  readonly someContentIdsAreReadyPromise = new Promise<void>((resolve) => {
    this.newContentArrived = resolve;
  });

  splittingOperationPromise?: Promise<void>;

  // The time we last chose new content when updating due to a period.
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

  /**
   * If we made any temp assets due to splitting, remember these so we don't have to
   * make them again.
   */
  readonly contentIdToSplitId = new Map<string, string>();

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
      (virtualOffset, socket) => {
        this.sendContentToClient(virtualOffset, socket);
      },
    );
  }
  contentEnded(): void {
    // When content ends, we don't do anything, because we let the period restart things.
  }
  async splitGlobalContent(contentId: ContentId): Promise<ContentId> {
    if (!this.config.split) {
      throw new Error("Asked to split content when config is not set to split");
    }

    // Check if this content has an existing cache entry.
    const existing = this.contentIdToSplitId.get(contentId.id);
    if (existing) {
      return { id: existing, local: true };
    }

    const originalId = contentId.id;
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
    log.debugAt(
      1,
      `Splitting ${contentId.id}: Clients are currently occupying ${rect.w}x${rect.h}`,
    );

    // Make a temp directory
    const temp = await makeTempDir(contentId.id);
    log.debugAt(1, `Splitting ${contentId.id}: Created temp ${temp}`);

    // 1) Split the content into MxN tiles.
    log.debugAt(1, `Splitting ${contentId.id}: Downloading file...`);
    // We need to download it locally.
    const bytes = await this.loadStrategy.getBytes(contentId);
    const tempFilePath = path.join(temp, contentId.id);
    log.debugAt(1, `Splitting ${contentId.id}: File path: ${tempFilePath}`);
    await Deno.writeFile(tempFilePath, bytes);

    const command = [
      "convert",
      tempFilePath,
      "-crop",
      `${rect.w}x${rect.h}@`,
      "+repage",
      "+adjoin",
      path.join(temp, "%d.png"),
    ];
    await Deno.run({ cmd: command }).status();
    log.debugAt(1, `Splitting ${contentId.id}: Invoked imagemagick.`);

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
    log.debugAt(
      1,
      `Splitting ${contentId.id}: Moved temp files to final locations.`,
    );

    // Replace the global content id with the path to the local file and mark the content as local.
    log.debugAt(1, `New content id: ${contentId.id}`);

    this.contentIdToSplitId.set(originalId, contentId.id);

    // Everything is split!
    return {
      id: `/tmp/${path.basename(temp)}|.png`,
      local: true,
    };
  }
  async chooseNewGlobalContent() {
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

    let chosenContentId;
    if (this.config.shuffle) {
      chosenContentId = random.pick([...possibleContent]);
    } else {
      chosenContentId = [...possibleContent][this.nextContentIndex];
      this.nextContentIndex = (this.nextContentIndex + 1) %
        possibleContent.size;
    }

    if (this.config.split) {
      chosenContentId = await this.splitGlobalContent(chosenContentId);
    }

    log(`Chose new global content: ${chosenContentId.id}`);
    this.globalContentId = chosenContentId;

    this.nextDeadline = time.now();
  }
  async sendContentToClient(offset: Point, socket: TypedWebsocketLike) {
    log.debugAt(1, "Waiting for content");
    await this.someContentIdsAreReadyPromise;
    log.debugAt(1, `${this.contentBag.contentIds.length} content ready`);
    // Now, depending on the config, select the right content.
    if (this.config.presplit || this.config.split) {
      if (!this.globalContentId && !this.splittingOperationPromise) {
        // We need to start one.
        this.splittingOperationPromise = this.chooseNewGlobalContent();
      }
      // If there's a global content operation in progress, wait for it.
      await this.splittingOperationPromise;
      this.splittingOperationPromise = undefined;
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
          if (this.splittingOperationPromise) {
            log.warn(
              "Inflight split still in progress, but period has expired.",
            );
          }
          this.globalContentId = undefined;
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
