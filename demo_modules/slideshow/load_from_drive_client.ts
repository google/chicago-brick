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

import { delay } from "../../lib/promise.ts";
import { easyLog } from "../../lib/log.ts";
import { WS } from "../../lib/websocket.ts";
import { ClientLoadStrategy } from "./client_interfaces.ts";

const log = easyLog("wall:slideshow:drive");
const API_BASE_URL = "https://www.googleapis.com/drive/v3";

export class LoadFromDriveClientStrategy implements ClientLoadStrategy {
  headersPromise: Promise<Record<string, string>>;
  constructor(network: WS) {
    this.headersPromise = new Promise((resolve) => {
      network.once(
        "slideshow:drive:load:credentials",
        (headers: Record<string, string>) => {
          resolve(headers);
        },
      );
    });
  }
  async loadContent(
    { fileId, clippedContent }: { fileId: string; clippedContent: Uint8Array },
  ): Promise<{ element: Element }> {
    let blob, type: string;
    if (clippedContent) {
      type = "image/png";
      blob = new Blob([clippedContent], { type });
    } else if (fileId) {
      let res;
      let timeout = Math.floor(1000 + Math.random() * 1000);
      for (let numTriesLeft = 5; numTriesLeft > 0; numTriesLeft--) {
        res = await fetch(`${API_BASE_URL}/files/${fileId}?alt=media`, {
          headers: new Headers(await this.headersPromise),
        });
        if (res.ok) {
          break;
        }
        log(`Failed to load! ${fileId} ${res.status} ${res.statusText}`);
        if (res.status == 403) {
          // Probably rate-limited. To fix this, we'll attempt to download
          // again after a random, exponentially increasing time.
          log(
            `Retrying after ${timeout} ms and ${numTriesLeft} tries left...`,
          );
          await delay(timeout);
          timeout *= 2.0;
          timeout += Math.floor(Math.random() * 1000);
        } else {
          break;
        }
      }
      if (!res.ok) {
        throw new Error(
          `Failed to download ${fileId}! ${res.status} ${res.statusTxt}`,
        );
      }

      type = res.headers.get("content-type");
      const size = res.headers.get("content-length");
      debug(`Downloading image (${type} size:${size})`);
      blob = await res.blob();
    }
    const url = URL.createObjectURL(blob);
    try {
      if (type.indexOf("image") != -1) {
        return await new Promise((resolve, reject) => {
          const img = document.createElement("img");
          img.src = url;
          // Don't report that we've loaded the image until onload fires.
          img.addEventListener("load", () => {
            resolve({ element: img });
          });
          img.addEventListener(
            "error",
            () => reject(new Error(`${type}, ${url}`)),
          );
        });
      } else if (type.indexOf("video") != -1) {
        return await new Promise((resolve, reject) => {
          const video = document.createElement("video");
          video.src = url;
          video.autoplay = true;
          video.addEventListener("load", () => {
            resolve({ element: video });
          });
          video.addEventListener("error", () => reject(new Error()));
        });
      } else {
        throw new Error("Unknown MIME type for drive file: " + type);
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

declare global {
  interface EmittedEvents {
    "slideshow:drive:load:credentials": (
      headers: Record<string, string>,
    ) => void;
  }
}
