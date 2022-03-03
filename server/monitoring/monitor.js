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

import * as network from '../network/network.js';

let currentStatus = {};
let sendCurrentState = socket => {
  socket.send('monitor', currentStatus);
};

let monitoringSockets = [];
network.emitter.on('new-client', info => {
  // Listen for a msg indicating that it would like some monitoring.
  info.socket.on('enable-monitoring', () => {
    monitoringSockets.push(info.socket);
    sendCurrentState(info.socket);
  });
  info.socket.on('disable-monitoring', () => {
    let i = monitoringSockets.indexOf(info.socket);
    if (i != -1) {
      monitoringSockets.splice(i, 1);
    }
  });
});

let enabled = false;
export function isEnabled() {
  return enabled;
}
export function enable() {
  enabled = true;
  monitoringSockets.forEach(sendCurrentState);
}
export function update(change) {
  if (enabled) {
    Object.assign(currentStatus, change);
    monitoringSockets.forEach(socket => socket.send('monitor', change));
  }
}
