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

import asset from "../../client/asset/asset.ts";
import { easyLog } from "../../lib/log.ts";
import { Content, LocalLoadConfig } from "./interfaces.ts";
import { ClientLoadStrategy } from "./client_interfaces.ts";
import { Surface } from "../../client/surface/surface.ts";
import mime from "https://esm.sh/v96/mime@3.0.0/deno/mime.js";
import { WS } from "../../lib/websocket.ts";

const log = easyLog("slideshow:local");

// LOAD LOCAL FILES STRATEGY
// This loading strategy knows how to load both images and videos from the local file
// system, actually it's a proxy, but whatever.
// Config:
//   image: an object denoting references to images, containing sub-keys:
//     file: string - A local asset name (like 'cobra.ext'), which will get rewritten
//         to $ASSET_PATH/cobra.ext. The name must contain a file extension.
//     presplit: boolean - If true, assumes that the asset has been presplit by an
//         offline process into multiple files under a directory. A
//         file ending with, say cobra.webm, must have presplit files at
//         cobra/r${R}c${C}.webm.
//   video: an object denoting references to videos, containing sub-fields:
//     file: string - A local asset name (like 'cobra.ext'), which will get rewritten
//         to $ASSET_PATH/cobra.ext. The name must contain a file extension.
//     presplit: boolean - If true, assumes that the asset has been presplit by an
//         offline process into multiple files under a directory. A
//         file ending with, say cobra.webm, must have presplit files at
//         cobra/r${R}c${C}.webm.
//     sync: boolean - If true, keep the videos sync'd across their displays.
//     randomize_start: boolean - If true, pick a random time to start the videos.
//   Note: only 1 of image or video can be specified when using the presplit strategy.

function extname(path: string) {
  return path.substring(path.lastIndexOf("."));
}

export class LoadLocalClientStrategy implements ClientLoadStrategy {
  constructor(
    readonly config: LocalLoadConfig,
    readonly surface: Surface,
    readonly network: WS,
    readonly startTime: number,
  ) {
  }
  loadContent(contentId: string): Promise<Content> {
    // The display strategy has requested some content for the provided rectangle (and screen).

    // Check to see if the content is an image or a video.
    const type: string = mime.getType(extname(contentId));
    if (type.startsWith("image")) {
      // I need to make an Image.
      return new Promise((resolve, reject) => {
        const img = document.createElement("img");
        img.addEventListener("load", () => {
          log(`Loaded image: ${contentId}`);
          const content: Content = {
            type: "image" as const,
            width: img.width,
            height: img.height,
            size: img.width * img.height,
            element: img,
          };
          resolve(content);
        });
        img.addEventListener("error", (err) => {
          log(`Error loading image: ${contentId} ${err.message}`);
          reject(err);
        });
        img.src = asset(contentId);
      });
    } else if (type.startsWith("video")) {
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        if (this.config.video?.loop) {
          video.setAttribute("loop", "loop");
        } else {
          video.addEventListener("ended", () => {
            this.network.send("slideshow:content_ended", contentId);
          });
        }
        let drawFn: ((time: number, delta: number) => void) | undefined =
          undefined;
        if (this.config.presplit) {
          // We need to sync the video.
          drawFn = (time: number, delta: number) => {
            // When restarting a server, time can wind backwards. If we ever see
            // this case, just flip out.
            if (delta <= 0) {
              return;
            }

            const durationMs = video.duration * 1000.0;

            // We want the videos to be sync'd to some ideal clock. We use the
            // server's clock, as guessed by the client.
            const correctTime =
              ((time - this.startTime) % durationMs + durationMs) %
              durationMs;

            // The video is currently here:
            const actualTime = video.currentTime * 1000.0;

            // If these times are off by a lot, we should seek to the right time.
            // We can't always seek, because the HTML5 video spec doesn't specify
            // the granuality of seeking, and browsers round by as much as 250ms
            // in practice!
            if (Math.abs(actualTime - correctTime) > 3000) {
              log(`Seek from ${actualTime} to ${correctTime}`);
              video.currentTime = correctTime / 1000.0;
            } else {
              // The time difference is too small to rely on seeking, so let's
              // adjust the playback speed of the video in order to gradually
              // sync the videos.
              const msOff = correctTime - actualTime;
              const rate = msOff >= 33 ? 2 : msOff <= -33 ? 0.5 : 1.0;
              video.playbackRate = rate;
            }
          };
        }
        video.addEventListener("error", (err) => {
          log(`Error loading video: ${contentId} ${err.message}`);
          reject(video.error!);
        });
        video.addEventListener("loadedmetadata", () => {
          log(`Video loaded: ${contentId}`);
          if (this.config.video?.randomize_start) {
            video.currentTime = Math.random() * video.duration;
          }
          video.muted = true;
          video.play();

          resolve({
            type: "video",
            width: video.videoWidth,
            height: video.videoHeight,
            size: video.videoWidth * video.videoHeight * video.duration,
            element: video,
            draw: drawFn,
          });
        });
        video.src = asset(contentId);
        video.load();
      });
    } else {
      throw new Error(`Unrecognized asset type: ${contentId}`);
    }
  }
}
