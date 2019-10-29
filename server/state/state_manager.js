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

import {getSocket} from '../network/network.js';

// A map of module id -> {state name -> {time, data}};
const stateMap = {};
// Takes the global network socket (not a per-module socket).
export function forModule(network, id) {
  // Return a module-appropriate facade that can be used to fill out the state
  // map.
  return {
    open() {
      stateMap[id] = {};
      return {
        store(stateName, time, data) {
          // Store this state only, forgetting about the rest of them.
          stateMap[id][stateName] = {time, data};
        }
      };
    },
    close() {
      delete stateMap[id];
      network.emit('state-closed', id);
    }
  }
}

export function send() {
  getSocket().emit('state', stateMap);
}
