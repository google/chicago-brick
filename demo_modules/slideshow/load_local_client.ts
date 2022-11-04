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
import { DrawFn, setUpVideo } from "./video_content_utils.ts";

const log = easyLog("slideshow:local");

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
        img.src = asset(contentId.id);
      });
    } else if (type.startsWith("video")) {
      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        if (this.config.video?.loop) {
          video.setAttribute("loop", "loop");
        } else {
          video.addEventListener("ended", () => {
            log(`Content ${contentId} ended`);
            this.network.send(
              "slideshow:content_ended",
              contentId,
              this.surface.virtualOffset,
            );
          });
        }
        let drawFn: DrawFn | undefined = undefined;
        if (this.config.video) {
          drawFn = setUpVideo(this.config.video, () => {
            return video.duration * 1000;
          }, () => {
            return video.currentTime * 1000;
          }, (time) => {
            video.currentTime = time / 1000;
          }, (rate) => {
            if (video.playbackRate !== rate) {
              log("Adjusting playback rate to", rate);
              video.playbackRate = rate;
            }
          }, (str) => {
            let el = video.parentElement?.querySelector(
              ".test",
            ) as HTMLDivElement;
            if (!el) {
              el = document.createElement("div")!;
              el.classList.add("test");
              el.style.position = "absolute";
              el.style.left = "0";
              el.style.right = "0";
              el.style.top = "0";
              el.style.bottom = "0";
              el.style.textAlign = "center";
              el.style.font = "36px sans-serif";
              el.style.color = "white";
              video.parentElement?.appendChild(el);
            }

            el.textContent = str;
          }, log);
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
