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
import { ContentId, LocalLoadConfig } from "./interfaces.ts";
import { ClientLoadStrategy, Content } from "./client_interfaces.ts";
import { Surface } from "../../client/surface/surface.ts";
import mime from "https://esm.sh/v96/mime@3.0.0/deno/mime.js";
import { WS } from "../../lib/websocket.ts";
import { DrawFn, setUpVideoElement } from "./video_content_utils.ts";

const log = easyLog("slideshow:local");

function extname(path: string) {
  return path.substring(path.lastIndexOf("."));
}

export class LoadLocalClientStrategy implements ClientLoadStrategy {
  constructor(
    readonly config: LocalLoadConfig,
    readonly surface: Surface,
    readonly network: WS,
  ) {
  }
  loadContent(contentId: ContentId): Promise<Content> {
    // The display strategy has requested some content for the provided rectangle (and screen).
    // Check to see if the content is an image or a video.
    const type: string = mime.getType(extname(contentId.id));
    if (type.startsWith("image")) {
      // I need to make an Image.
      return new Promise((resolve, reject) => {
        const img = document.createElement("img");
        img.addEventListener("load", () => {
          log(`Loaded image: ${contentId.id}`);
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
          log(`Error loading image: ${contentId.id} ${err.message}`);
          reject(err);
        });
        if (contentId.local) {
          // This content was forced to be local. It's probably only stored on the server.
          // Don't use the 'asset' function for this case, then.
          img.src = contentId.id;
        } else {
          img.src = asset(contentId.id);
        }
      });
    } else if (type.startsWith("video")) {
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        if (this.config.video?.loop) {
          video.setAttribute("loop", "loop");
        } else {
          video.addEventListener("ended", () => {
            log(`Content ${contentId.id} ended`);
            this.network.send(
              "slideshow:content_ended",
              contentId,
              this.surface.virtualOffset,
            );
          });
        }
        let drawFn: DrawFn | undefined = undefined;
        if (this.config.video) {
          drawFn = setUpVideoElement(this.config.video, video, log);
        }
        video.addEventListener("error", (err) => {
          log(`Error loading video: ${contentId.id} ${err.message}`);
          reject(video.error!);
        });
        video.addEventListener("loadedmetadata", () => {
          log(`Video loaded: ${contentId.id}`);
          if (this.config.video?.randomizeStart) {
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
        video.src = asset(contentId.id);
        video.load();
      });
    } else {
      throw new Error(`Unrecognized asset type: ${contentId.id}`);
    }
  }
}
