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

import {WS} from '/lib/websocket.ts';
import * as info from '/client/util/info.js';
import * as time from '/client/util/time.js';
import {installModuleOverlayHandler, makeModuleOverlaySocket, cleanupModuleOverlayHandler} from '../../lib/socket_wrapper.js';

let socket;
let ready, readyPromise = new Promise(r => ready = r);

/**
 * Initializes the connection with the server & sets up the network layer.
 */
export function init() {
  socket = WS.clientWrapper(`ws://${location.host}/websocket`);

  function sendHello() {
    socket.send('client-start', {
      offset: info.virtualOffset,
      rect: info.virtualRectNoBezel.serialize()
    });
  }

  // When we reconnect after a disconnection, we need to tell the server
  // about who we are all over again.
  socket.on('connect', sendHello);

  // Install our time listener.
  socket.on('time', time.adjustTimeByReference);
  // Install the machinery for our per-module network.
  installModuleOverlayHandler(socket);

  // Tell the server who we are.
  sendHello();
  ready();
}
export function on(event, callback) {
  socket.on(event, callback);
}
export function removeListener(event, callback) {
  socket.removeListener(event, callback);
}
export const whenReady = readyPromise;
export function send(event, data) {
  if (socket) {
    socket.send(event, data);
  }
}

// Return an object that can be opened to create an isolated per-module network,
// and closed to clean up after that module.
export function forModule(id) {
  return {
    open() {
      return makeModuleOverlaySocket(id, socket);
    },
    close() {
      cleanupModuleOverlayHandler(id);
    }
  };
}
