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

import { easyLog } from "../../lib/log.ts";
import { rateLimit403Responses } from "../../lib/rate_limit.ts";
import { WS } from "../../lib/websocket.ts";
import { ClientLoadStrategy, Content } from "./client_interfaces.ts";
import { ContentId, DriveLoadConfig } from "./interfaces.ts";
import { DrawFn, setUpVideoElement } from "./video_content_utils.ts";

const log = easyLog("wall:slideshow:drive");
const API_BASE_URL = "https://www.googleapis.com/drive/v3";

export class LoadFromDriveClientStrategy implements ClientLoadStrategy {
  headersPromise: Promise<Record<string, string>>;
  constructor(
    readonly config: DriveLoadConfig,
    network: WS,
    readonly abortSignal: AbortSignal,
  ) {
    this.headersPromise = new Promise((resolve) => {
      network.on("slideshow:drive:credentials", (headers) => {
        // If anyone is waiting for this promise to resolve, resolve it.
        resolve(headers);
        // Also, if anyone else shows up afterwards, give them the headers.
        this.headersPromise = Promise.resolve(headers);
      });
    });
    network.send("slideshow:drive:init");
  }
  async loadContent(
    contentId: ContentId,
  ): Promise<Content> {
    log(`Loading content: ${contentId.id}`);

    const res = await rateLimit403Responses(async () => {
      return await fetch(
        `${API_BASE_URL}/files/${contentId.id}?alt=media`,
        {
          headers: new Headers(await this.headersPromise),
        },
      );
    }, this.abortSignal);
    if (!res.ok) {
      throw new Error(
        `Failed to download ${contentId.id}! ${res.status} ${res.statusText}`,
      );
    }

    const type = res.headers.get("content-type") || "";
    const size = res.headers.get("content-length");
    log(`Downloading image ${contentId.id} (${type} size:${size})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    // Wrap this in a try to ensure the the URL is revoked.
    try {
      if (type?.startsWith("image")) {
        return await new Promise((resolve, reject) => {
          const img = document.createElement("img");
          // Don't report that we've loaded the image until onload fires.
          img.addEventListener("load", () => {
            resolve({
              width: img.naturalWidth,
              height: img.naturalHeight,
              size: img.naturalWidth * img.naturalHeight,
              element: img,
              type: "image",
            });
          });
          img.addEventListener("error", (e) => {
            reject(
              new Error(
                `Error loading drive image ${contentId.id}: ${type} ${e.error}`,
              ),
            );
          });
          img.src = url;
        });
      } else if (type?.startsWith("video")) {
        return await new Promise((resolve, reject) => {
          const video = document.createElement("video");
          video.autoplay = true;

          let drawFn: DrawFn | undefined = undefined;
          if (this.config.video) {
            drawFn = setUpVideoElement(this.config.video, video, log);
          }

          video.addEventListener("load", () => {
            resolve({
              width: video.videoWidth,
              height: video.videoHeight,
              size: video.videoWidth * video.videoHeight * video.duration,
              element: video,
              type: "video",
              draw: drawFn,
            });
          });
          video.addEventListener("error", (e) => {
            reject(
              new Error(
                `Error loading drive video ${contentId.id}: ${type} ${e.error}`,
              ),
            );
          });
          video.src = url;
        });
      } else {
        throw new Error("Unknown MIME type for drive file: " + type);
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
