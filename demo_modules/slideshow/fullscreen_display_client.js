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

import {ClientDisplayStrategy} from './interfaces.js';

export default function({debug, wallGeometry, network}) {
  // FULLSCREEN DISPLAY STRATEGY
  // This display strategy shows a single element per screen, updating at a rate
  // specified in the config. We wait for the corresponding element to load
  // before we show it.
  // Messages:
  //   display:init() - Sent by client when it is ready to receive content. This
  //       synchonizes a race between content loading on the server and the
  //       client being ready for that content.
  //   display:content(opaqueContentBlob) - Sent by server to inform the client
  //       of new content that has been loaded and that the client should begin
  //       showing.
  // Config:
  //   period: number - Number of millliseconds that should elapse between the
  //           server refreshing a random client's content. If this is 0 or
  //           undefined, the content will never refresh.
  class FullscreenClientDisplayStrategy extends ClientDisplayStrategy {
    constructor(config) {
      super();
      this.config_ = config;
    }
    init(surface, loadStrategy) {
      let logError = (...args) => console.error(...args);
      //const logErrorPromise = import('../../client/util/log.js').then(e => logError = e.error(debug));
      this.content = null;
      network.emit('display:init');
      this.surface = surface;
      network.on('display:content', c => {
        let container = this.surface.container;
        let info = container.querySelector('#fullscreen-info');
        if (!info) {
          info = document.createElement('div');
          info.id = 'fullscreen-info';
          info.style.position = 'absolute';
          info.style.left = '0';
          info.style.right = '0';
          info.style.top = '0';
          info.style.bottom  = '0';
          info.style.color = 'white';
          info.style.font = 'bolder 18px monospace';
          container.appendChild(info);
        }
        info.textContent = `Loading "${c}..."`;

        loadStrategy.loadContent(c).then(content => {
          // One piece of content per client.
          this.content = content;
          let s = this.config_.image && this.config_.image.scale || 'stretch';
          this.surface.container.style.display = 'flex';
          this.surface.container.style.alignItems = 'center';
          this.surface.container.style.justifyContent = 'center';
          switch(s) {
            case 'stretch':
              content.style.position = 'absolute';
              content.style.top = 0;
              content.style.left = 0;
              content.style.width = '100%';
              content.style.height = '100%';
              break;
            case 'full':
              content.style.display = 'block';
              if (content.naturalWidth/this.surface.virtualRect.w >=
                  content.naturalHeight/this.surface.virtualRect.h) {
                content.style.width = '100%';
              } else {
                content.style.height = '100%';
              }
          }

          // Clear surface.
          while (this.surface.container.firstChild) {
            this.surface.container.removeChild(this.surface.container.firstChild);
          }
          // Add content.
          this.surface.container.appendChild(content);
        }).catch(err => {
          info.innerHTML += '<br>';
          info.innerHTML += `<span style="color:red">Error! ${err}</span>`;
          if (logError) {
            logError(err);
          }
        });
      });
    }
    draw(time, delta) {
      if (this.content && this.content.draw) {
        this.content.draw(time, delta);
      }
    }
  }

  return {
    Client: FullscreenClientDisplayStrategy
  };
}
