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

import * as sharedState from '/lib/shared_state.js';
import Debug from '/lib/lame_es6/debug.js';
const debug = Debug('wall:state_manager');

// Describes something that tracks all sharedstate and provides methods for
// the communication of that state across the network.
export class StateManager {
  constructor(network) {
    // A map of tracked state name -> state variable.
    this.trackedState_ = {};
    this.network_ = network;

    // Listen for communication from the server. NOTE: we rely on the network's
    // own cleanup protocol to stop listening here.
    // TODO(applmak): Vet that this works as expected and that no further
    // disposal is needed.
    network.on('newstate', newstate => {
      if (newstate.name in this.trackedState_) {
        return;
      }
      debug('Received new state registration ' + newstate.name);
      this.trackedState_[newstate.name] = new sharedState.SharedState(
          newstate.name,
          sharedState.decodeInterpolator(newstate.interpolatorDef));
    });

    network.on('state', data => {
      data.forEach(state => {
        if (!(state.name in this.trackedState_)) {
          debug('Data received for state that wasn\'t created! ' + state.name);
          return;
        }
        if (state.dataPoint !== undefined) {
          this.get(state.name).set(state.dataPoint.value, state.dataPoint.time);
        }
      });
    });
  }

  get(name) {
    return this.trackedState_[name];
  }
}
