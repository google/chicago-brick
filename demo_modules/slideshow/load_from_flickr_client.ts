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

import { ClientLoadStrategy, Content } from "./client_interfaces.ts";
import { ContentId } from "./interfaces.ts";
import { easyLog } from "../../lib/log.ts";

const log = easyLog("slideshow:flickr");

export class LoadFromFlickrClientStrategy implements ClientLoadStrategy {
  loadContent(contentId: ContentId): Promise<Content> {
    return new Promise((resolve, reject) => {
      const img = document.createElement("img");
      // Don't report that we've loaded the image until onload fires.
      img.addEventListener("load", () => {
        log(`Loaded image`, contentId.id);
        resolve({
          element: img,
          height: img.naturalHeight,
          size: img.naturalHeight * img.naturalWidth,
          type: "image",
          width: img.naturalWidth,
        });
      });
      img.addEventListener("error", (e) => {
        reject(e);
      });
      img.src = contentId.id;
    });
  }
}
