/* Copyright 2015 Google Inc. All Rights Reserved.

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

'use strict';
const debug = require('debug');
const interfaces = require('demo_modules/slideshow/interfaces');

// LOAD VIDEO STRATEGY
// This loading strategy knows how to load a normal HTML5-video.
// Config:
//   file: string - A URL to a file (starting with a protocol, like http://)
//         or a local asset name (like 'cobra.ext'), which will get rewritten
//         to video/cobra.ext. Local assets must contain a file extension.
//   presplit: boolean - If true, assumes that the video has been presplit by an
//             offline process into multiple files under a video directory. A
//             file ending with, say cobra.webm, must have presplit files at
//             cobra/r${R}c${C}.webm.
class LoadVideoServerStrategy extends interfaces.ServerLoadStrategy {
  constructor(config) {
    super();
    this.config = config;
  }
  loadMoreContent(opt_paginationToken) {
    return Promise.resolve({
      content: [this.config.file]
    });
  }
  serializeForClient() {
    return {video: this.config};
  }
}

class LoadVideoClientStrategy extends interfaces.ClientLoadStrategy {
  constructor(config) {
    super();
    this.config = config;
  }
  init(surface) {
    this.surface = surface;
  }
  loadContent(url) {
    return new Promise((resolve, reject) => {
      let video = document.createElement('video');
      video.setAttribute('loop', 'loop');
      video.setAttribute('width', this.surface.virtualRect.w);
      video.setAttribute('height', this.surface.virtualRect.h);
      
      // PREPARE THE URL:
      let extIndex = url.lastIndexOf('.');
      let finalUrl = url;
      // Remove extension.
      if (extIndex != -1) {
        finalUrl = url.substring(0, extIndex);
      }
      
      // If we are talking about pre-split video, then we are reading files 
      // with a specific pattern. Generate the appropriate name for this client.
      if (this.config.presplit) {
        finalUrl += `/r${this.surface.virtualOffset.y}c${this.surface.virtualOffset.x}`;
      }
      
      // Add extension back.
      if (extIndex != -1) {
        finalUrl += url.substr(extIndex);
      }
      
      // If the url has no protocol, it's an asset.
      if (finalUrl.indexOf(':') == -1) {
        const asset = require('client/asset/asset');
        finalUrl = asset(`video/${finalUrl}`);
      }
      
      video.src = finalUrl;
      video.load();
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
        
        video.play();
        
        resolve(video);
      });
    });
  }
}

module.exports = {
  Server: LoadVideoServerStrategy,
  Client: LoadVideoClientStrategy
};
