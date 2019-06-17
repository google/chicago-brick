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

import io from '/lib/lame_es6/socket.io-client.js';
import Debug from '/lib/lame_es6/debug.js';
import * as info from '/client/util/info.js';

const debug = Debug('wall:network');

let socket;

let ready, readyPromise = new Promise(r => ready = r);

// Open the connection with the server once the display properties are
// known.
export function openConnection(opt_displayRect) {
  socket = io(location.host);
  if (opt_displayRect) {
    socket.on('config', function() {
      socket.emit('config-response', opt_displayRect.serialize());
      ready();
    });
  }
}
export function on(event, callback) {
  socket.on(event, callback);
}
export function once(event, callback) {
  socket.once(event, callback);
}
export function removeListener(event, callback) {
  socket.removeListener(event, callback);
}
export const whenReady = readyPromise;
export function send(event, data) {
  if (socket) {
    socket.emit(event, data);
  }
}
export function forModule(id) {
  var moduleSocket;
  var externalNspName = `module${id.replace(/[^0-9]/g, 'X')}`;
  return {
    open: function() {
      var baseAddr = location.protocol + '//' + location.host;
      var addr = `${baseAddr}/${externalNspName}`;
      moduleSocket = io(addr, {
        multiplex: false,
        query: {
          id,
          rect: info.virtualRectNoBezel.serialize()
        }
      });
      debug('Opened per-module socket @ ' + externalNspName);
      return moduleSocket;
    },
    close: function() {
      debug('Closed per-module socket @ ' + externalNspName);
      moduleSocket.removeAllListeners();
      moduleSocket.close();
      moduleSocket = undefined;
    }
  };
}
