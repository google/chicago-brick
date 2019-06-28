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

import * as time from '../util/time.js';
import {decodeInterpolator, SharedState} from '/lib/shared_state.js';
import assert from '/lib/assert.js';


class StateRecord {
  constructor() {
    this.state = {};
    this.priorData = {};
    this.clientClosedTime = Infinity;
    this.serverClosedTime = Infinity;
    this.lastUpdatedTime = time.now();
  }
}

function isClosedOrStale(state) {
  const now = time.now();
  return (state.clientClosedTime < now - 5000) ||
      (state.serverClosedTime < now - 5000) ||
      (state.lastUpdatedTime < now - 600000); // 10 minutes.
}

// A map of module id -> {
//   state: {state name -> SharedState},
//   clientClosedTime: timestamp,
//   serverClosedTime: timestamp,
// };
const stateMap = {};
export function forModule(network, id) {
  return {
    open() {
      // Before we add another state, reap old ones.
      for (const id in stateMap) {
        // If the client closed this more than 5 seconds ago,
        if (isClosedOrStale(stateMap[id])) {
          delete stateMap[id];
        }
      }

      if (!stateMap[id]) {
        stateMap[id] = new StateRecord;
      }
      return {
        define(stateName, def) {
          assert(!(stateName in stateMap[id].state), `State ${stateName} was already defined!`);
          stateMap[id].state[stateName] =
              new SharedState(stateName, decodeInterpolator(def));
          if (stateMap[id].priorData[stateName]) {
            // We have some data that the server sent before we were ready.
            // Add it to the shared state now.
            for (const {data, time} of stateMap[id].priorData[stateName]) {
              // TODO(applmak): Warn if this overwrites data.
              stateMap[id].state[stateName].set(data, time);
            }
            delete stateMap[id].priorData[stateName];
          }
          return stateMap[id].state[stateName];
        },
        get(stateName) {
          return stateMap[id].state[stateName];
        }
      };
    },
    close() {
      if (stateMap[id]) {
        stateMap[id].clientClosedTime = time.now();
      }
    }
  }
}

export function init(network) {
  network.on('state', stateFromServer => {
    for (const id in stateFromServer) {
      if (stateMap[id] && isClosedOrStale(stateMap[id])) {
        // Skip closed states.
        continue;
      }
      if (!stateMap[id]) {
        stateMap[id] = new StateRecord;
      }
      for (const name in stateFromServer[id]) {
        if (stateMap[id].state[name]) {
          // The client has already created this state.
          const {data, time} = stateFromServer[id][name];
          stateMap[id].state[name].set(data, time);
        } else {
          // The client hasn't registered for this state yet...
          // We'll hang onto it anyway.
          stateMap[id].priorData[name] = stateMap[id].priorData[name] || [];
          stateMap[id].priorData[name].push(stateFromServer[id][name]);
          while (stateMap[id].priorData[name].length > 25) {
            stateMap[id].priorData[name].shift();
          }
        }
      }
      stateMap[id].lastUpdatedTime = time.now();
    }
  });
  network.on('state-closed', id => {
    if (stateMap[id]) {
      stateMap[id].serverClosedTime = time.now();
    }
  });
}
