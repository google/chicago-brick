/* Copyright 2018 Google Inc. All Rights Reserved.

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

import {ClientLoadStrategy} from './interfaces.js';
import {delay} from '../../lib/promise.js';

const API_BASE_URL = 'https://www.googleapis.com/drive/v2';

export default function({debug}) {
  class LoadFromDriveClientStrategy extends ClientLoadStrategy {
    constructor(config) {
      super();
      this.config = config;
    }
    async loadContent(fileId) {
      let res;
      let timeout = Math.floor(1000 + Math.random() * 1000);
      for (let numTriesLeft = 5; numTriesLeft > 0; numTriesLeft--) {
        res = await fetch(`${API_BASE_URL}/files/${fileId}?alt=media`, {
          headers: new Headers({
            'Authorization': 'Bearer ' + this.config.credentials.access_token
          })
        });
        if (res.ok) {
          break;
        }
        debug(`Failed to load! ${fileId} ${res.status} ${res.statusText}`);
        if (res.status == 403) {
          // Probably rate-limited. To fix this, we'll attempt to download
          // again after a random, exponentially increasing time.
          debug(`Retrying after ${timeout} ms and ${numTriesLeft} tries left...`);
          await delay(timeout);
          timeout *= 2.0;
          timeout += Math.floor(Math.random * 1000);
        } else {
          break;
        }
      }
      if (!res.ok) {
        throw new Error(`Failed to download ${fileId}! ${res.status} ${res.statusTxt}`);
      }

      const type = res.headers.get('content-type');
      const size = res.headers.get('content-length');
      debug(`Downloading image (${type} size:${size})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (type.indexOf('image') != -1) {
        return await new Promise((resolve, reject) => {
          const img = document.createElement('img');
          img.src = url;
          // Don't report that we've loaded the image until onload fires.
          img.addEventListener('load', () => {
            URL.revokeObjectURL(url);
            resolve(img);
          });
          img.addEventListener('error', () => reject(new Error(`${type}, ${url}`)));
        });
      } else if (type.indexOf('video') != -1) {
        return await new Promise((resolve, reject) => {
          const video = document.createElement('video');
          video.src = url;
          video.autoplay = true;
          video.addEventListener('load', () => {
            URL.revokeObjectURL(url);
            resolve(video);
          });
          video.addEventListener('error', () => reject(new Error));
        });
      } else {
        throw new Error('Unknown MIME type for drive file: ' + type);
      }
    }
  }

  return {
    Client: LoadFromDriveClientStrategy
  };
}
