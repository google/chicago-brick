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

import * as monitor from '/client/monitoring/monitor.js';
import * as network from '/client/network/network.js';
import * as stateManager from '/client/state/state_manager.js';
import {isStringWithOptions, makeConsoleLogger} from '/lib/console_logger.ts';
import {addLogger} from '/lib/log.ts';
import {now} from './util/time.js';
import {errorLogger} from './util/error_logger.js';
import {ClientModulePlayer} from '/client/modules/client_module_player.js';
import {ClientModule} from '/client/modules/module.js';

addLogger(makeConsoleLogger((...strings) => {
  const processedStrs = [];
  const css = [];
  for (const str of strings) {
    if (isStringWithOptions(str)) {  
      processedStrs.push(str.str);
      if (str.options.bold) {
        css.push('font-weight: bolder');
      }
      if (str.options.backgroundColor) {
        css.push(`background-color: ${str.options.backgroundColor}`);
      }
    } else {
      processedStrs.push(str);
      if (css.length) {
        // Only add a '' css if we already have something in the css box.
        css.push('');
      }
    }
  }
  console.log(...processedStrs, ...css);
}, now));
addLogger(errorLogger);

// Open our socket to the server.
network.init();
stateManager.init(network);

if (new URL(window.location.href).searchParams.get('monitor')) {
  monitor.enable();
}

const modulePlayer = new ClientModulePlayer;

// Server has asked us to load a new module.
network.on('loadModule',
    bits => modulePlayer.playModule(ClientModule.deserialize(bits)));

network.on('takeSnapshot', async req => {
  if (modulePlayer.oldModule &&
      modulePlayer.oldModule.instance &&
      modulePlayer.oldModule.instance.surface) {
    const image = modulePlayer.oldModule.instance.surface.takeSnapshot();
    if (image) {
      // You can't draw an imagedata, so we convert to an imagebitmap.
      const WIDTH = 192;
      const HEIGHT = Math.floor(WIDTH / image.width * image.height);
      const bitmap = await createImageBitmap(image, {
        resizeWidth: WIDTH,
        resizeHeight: HEIGHT,
      });

      // We can't get the data of a bitmap, so we make a new canvas to get
      // back an imagedata.
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const smallData = context.getImageData(0, 0, WIDTH, HEIGHT);

      // And now, we get the array itself.
      network.send('takeSnapshotRes', {
        data: Array.from(smallData.data),
        width: smallData.width,
        ...req,
      });
      return;
    }
  }
  console.error('snapshot failed', req);
  network.send('takeSnapshotRes', {...req});
});
