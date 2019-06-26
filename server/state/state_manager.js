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

import * as sharedState from '../../lib/shared_state.js';
import Debug from 'debug';
import {StateSchedule} from './state_schedule.js';
import assert from '../../lib/assert.js';

const debug = Debug('wall:state_manager');

// Describes something that tracks all sharedstate and provides methods for
// the communication of that state across the network.
export class StateManager {
  constructor(network) {
    // A map of tracked state name -> state variable.
    this.trackedState_ = {};

    // A map of name -> interpolatordef;
    this.interpolatorDefs_ = {};

    // The network to communicate on.
    this.network_ = network;

    this.network_.on('connection', socket => {
      debug('Received late request for new state from ' + socket.id);
      this.informLateClient_(socket);
    });
  }
  create(name, interpolatorDef) {
    assert(!(name in this.trackedState_));
    this.trackedState_[name] = new sharedState.SharedState(
      name, sharedState.decodeInterpolator(interpolatorDef));

    this.interpolatorDefs_[name] = interpolatorDef;
    this.informClient_(name, this.network_);
  }
  // Makes an unshared SharedState instance for the private use of the server.  It
  // is not sent to clients.
  createPrivate(interpolatorDef) {
    return new sharedState.SharedState(
      'private', sharedState.decodeInterpolator(interpolatorDef));
  }
  createSchedule(interpolatorDef, schedule) {
    return new StateSchedule(this, interpolatorDef, schedule);
  }
  informLateClient_(socket) {
    for (var k in this.trackedState_) {
      this.informClient_(k, socket);
    }
  }
  informClient_(name, socket) {
    if (socket.id) {
      debug('informing client ' + socket.id + ' about state', name);
    } else {
      debug('informing all clients about state', name);
    }
    socket.emit('newstate', {
      name: name,
      interpolatorDef: this.interpolatorDefs_[name],
    });
  }
  get(name) {
    return this.trackedState_[name];
  }

  // Sends all of the most recent state to the clients.
  // This assumes that we'll call this function no more often than we change the
  // value of the variable for the latest time (which seems safe).
  send() {
    // Build a packet of data about all of the tracked state.
    const stateData = Object.keys(this.trackedState_).map(name => {
      const store = this.trackedState_[name].store_;
      return {
        name,
        dataPoint: store[store.length - 1],
      };
    });

    this.network_.emit('state', stateData);
  }
}
