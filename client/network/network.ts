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

import { WS } from "../../lib/websocket.ts";
import * as info from "../util/info.ts";
import * as time from "../../lib/adjustable_time.ts";

export const socket = WS.clientWrapper(`ws://${location.host}/websocket`);
let ready: () => void;
const readyPromise = new Promise<void>((r) => ready = r);

/**
 * Initializes the connection with the server & sets up the network layer.
 */
export function init() {
  function sendHello() {
    socket.send("client-start", {
      offset: info.virtualOffset,
      rect: info.virtualRectNoBezel.serialize(),
    });
  }

  // When we reconnect after a disconnection, we need to tell the server
  // about who we are all over again.
  socket.on("connect", () => {
    sendHello();
    ready();
  });

  // Install our time listener.
  socket.on("time", time.adjustTimeByReference);
}

export const whenReady = readyPromise;
