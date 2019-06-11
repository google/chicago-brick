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

import {ServerLoadStrategy, ClientLoadStrategy} from './interfaces.js';

export default function({debug, asset}) {
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

  class LoadLocalServerStrategy extends ServerLoadStrategy {
    constructor(config) {
      super();

      this.paths = [];
      this.config = config;
      if (this.config.image) {
        if (this.config.image.file) {
          this.paths.push({image: this.config.image.file});
        } else {
          this.paths.push(...this.config.image.files.map(f => ({image: f})));
        }
      }
      if (this.config.video) {
        if (this.config.video.file) {
          this.paths.push({video: this.config.video.file});
        } else {
          this.paths.push(...this.config.video.files.map(f => ({video: f})));
        }
      }
    }
    loadMoreContent() {
      return Promise.resolve({
        content: this.paths
      });
    }
    serializeForClient() {
      return {local: this.config};
    }
  }

  class LoadLocalClientStrategy extends ClientLoadStrategy {
    constructor(config) {
      super();
      this.config = config;
    }
    init(surface, startTime) {
      this.surface = surface;
      this.startTime = startTime;
    }
    loadContent(desc) {
      return new Promise((resolve, reject) => {
        let url = desc.image || desc.video;
        let sharedConfig = this.config.image || this.config.video;


        // PREPARE THE URL:
        let extIndex = url.lastIndexOf('.');
        let finalUrl = url;
        // Remove extension.
        if (extIndex != -1) {
          finalUrl = url.substring(0, extIndex);
        }

        // If we are talking about pre-split content, then we are reading files
        // with a specific pattern. Generate the appropriate name for this client.
        if (sharedConfig.presplit) {
          finalUrl += `/r${this.surface.virtualOffset.y}c${this.surface.virtualOffset.x}`;
        }

        // Add extension back.
        if (extIndex != -1) {
          finalUrl += url.substr(extIndex);
        }

        finalUrl = asset(`${finalUrl}`);

        if (desc.video) {
          let video = document.createElement('video');
          video.setAttribute('loop', 'loop');
          video.setAttribute('width', this.surface.virtualRect.w);
          video.setAttribute('height', this.surface.virtualRect.h);

          if (this.config.video.sync) {
            video.draw = (time, delta) => {
              // When restarting a server, time can wind backwards. If we ever see
              // this case, just flip out.
              if (delta <= 0) {
                return;
              }

              let duration = video.duration * 1000.0;

              // We want the videos to be sync'd to some ideal clock. We use the
              // server's clock, as guessed by the client.
              let correctTime = ((time - this.startTime) % duration + duration) % duration;

              // The video is currently here:
              let actualTime = video.currentTime * 1000.0;

              // If these times are off by a lot, we should seek to the right time.
              // We can't always seek, because the HTML5 video spec doesn't specify
              // the granuality of seeking, and browsers round by as much as 250ms
              // in practice!
              if (Math.abs(actualTime - correctTime) > 3000) {
                debug('seek', actualTime, correctTime);
                video.currentTime = correctTime / 1000.0;
              } else {
                // The time difference is too small to rely on seeking, so let's
                // adjust the playback speed of the video in order to gradually
                // sync the videos.
                let msOff = correctTime - actualTime;

                let rate = msOff >= 33 ? 2 : msOff <= -33 ? 0.5 : 1.0;
                video.playbackRate = rate;
              }
            };
          }

          video.src = finalUrl;
          video.load();
          video.addEventListener('error', err => reject(err));
          video.addEventListener('loadedmetadata', () => {
            // Scale the video so it's actually the size the element suggests. This
            // is trickier than it should be because the <video> element
            // letterboxes its content.
            let videoProportion = video.videoWidth / video.videoHeight;
            let containerProportion = this.surface.container.offsetWidth / this.surface.container.offsetHeight;

            if (containerProportion - videoProportion > 0.001) {
              let scalex = containerProportion / videoProportion;
              video.style.transform = `scale3d(${scalex}, 1.0, 1.0)`;
            } else if (containerProportion - videoProportion < 0.001) {
              let scaley = videoProportion / containerProportion;
              video.style.transform = `scale3d(1.0, ${scaley}, 1.0)`;
            }

            if (this.config.video.randomize_start) {
              video.currentTime = Math.random() * video.duration;
            }

            video.play();

            resolve(video);
          });
        } else {
          let img = document.createElement('img');
          img.addEventListener('load', () => resolve(img));
          img.addEventListener('error', err => reject(err));
          img.src = finalUrl;
        }
      });
    }
  }

  return {
    Server: LoadLocalServerStrategy,
    Client: LoadLocalClientStrategy
  };
}
