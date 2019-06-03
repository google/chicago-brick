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

import * as geometry from '../../lib/geometry.js';
import * as monitor from '../monitoring/monitor.js';
import Debug from 'debug';
import assert from '../../lib/assert.js';
import library from './module_library.js';
import {ServerStateMachine} from './server_state_machine.js';
import {State, StateMachine} from '../../lib/state_machine.js';
import {now} from '../util/time.js';

const debug = Debug('wall:module_state_machine');

function isDisplayInPoly(rect, poly) {
  // find the center point of this display:
  var cx = rect.w / 2 + rect.x;
  var cy = rect.h / 2 + rect.y;

  return geometry.isInside(poly, cx, cy);
}

// Takes a map of client ids -> client state machines. Not owned or changed
// by this class, only read.
export class ModuleStateMachine extends StateMachine {
  constructor(allClients) {
    super(new IdleState, debug);

    // Map of ID to ClientControlStateMachine for all clients.
    this.allClients_ = allClients;

    this.setContext({
      server: new ServerStateMachine,
      allClients,
    });

    // Forward errors from my child state machines to my listener.
    this.context_.server.setErrorListener(error => this.errorListener_(error));
    for (const id in this.allClients_) {
      this.allClients_[id].setErrorListener(error => this.errorListener_(error));
    }

    this.reloadHandler = reloadedModule => {
      // If the module that was just reloaded is the same one that we are playing, we should reload it.
      let currentModuleName = this.state.getCurrentModuleName();
      if (reloadedModule.name == currentModuleName) {
        this.playModule(reloadedModule.name);
      } else {
        // Otherwise, we ignore the reload event.
      }
    };
    library.on('reloaded', this.reloadHandler);

    /** True when the reload handler is installed. */
    this.reloadHandlerInstalled_ = true;
  }

  // Turn off the state machine at the specified, coordinated time.
  fadeToBlack(deadline) {
    if (monitor.isEnabled()) {
      monitor.update({module: {
        time: time.now(),
        event: 'fade-to-black',
        deadline: deadline
      }});
    }

    if (this.reloadHandlerInstalled_) {
      library.removeListener('reloaded', this.reloadHandler);
      this.reloadHandlerInstalled_ = false;
    }

    // Tell the clients to stop.
    for (const id in this.allClients_) {
      this.allClients_[id].playModule('_empty', deadline);
    }

    // Set us back to idle, awaiting further instructions.
    this.transitionTo(new IdleState);

    // Tell the server to stop.
    return this.context_.server.playModule('_empty', deadline);
  }

  newClient(clientInfo) {
    let client = this.allClients_[clientInfo.socket.id];
    this.state.newClient(client);
  }

  playModule(moduleName, timeToStartDisplay) {
    if (monitor.isEnabled()) {
      monitor.update({module: {
        time: time.now(),
        event: moduleName
      }});
    }
    if (!this.reloadHandlerInstalled_) {
      library.on('reloaded', this.reloadHandler);
      this.reloadHandlerInstalled_ = true;
    }

    this.state.playModule(moduleName, timeToStartDisplay);
  }
}

class IdleState extends State {
  enter(transition) {
    if (monitor.isEnabled()) {
      monitor.update({module: {
        time: time.now(),
        state: this.getName(),
      }});
    }

    this.transition_ = transition;
  }
  newClient(client) {}
  playModule(moduleName, timeToStartDisplay) {
    this.transition_(new DisplayState(moduleName, timeToStartDisplay));
  }
  getCurrentModuleName() {
    return '';
  }
}

class DisplayState extends State {
  constructor(moduleName, timeToStartDisplay) {
    super();

    // This current module we are attempting to show.
    this.moduleName_ = moduleName;

    // The time that we should begin to show the new module.
    this.timeToStartDisplay_ = timeToStartDisplay;
  }
  enter(transition, context) {
    this.transition_ = transition;

    debug(`Displaying ${this.moduleName_} starting at ${this.timeToStartDisplay_}`);

    if (monitor.isEnabled()) {
      monitor.update({module: {
        time: time.now(),
        name: this.moduleName_,
        state: this.getName(),
      }});
    }

    // Tell the server to transition to this new module.
    context.server.playModule(this.moduleName_, this.timeToStartDisplay_);

    // Tell each client to transition to the module.
    for (const id in context.allClients) {
      context.allClients[id].playModule(this.moduleName_, this.timeToStartDisplay_)
    }

    // Wait here until we're told to do something else.
  }
  newClient(client) {
    // Tell the new guy to load the next module NOW.
    // We'll presume that this guy arrived way after our coordinating time, so we'll tell him to switch now.
    client.playModule(this.moduleName_, this.timeToStartDisplay_);
  }
  playModule(moduleName, timeToStartDisplay) {
    this.transition_(new DisplayState(moduleName, timeToStartDisplay));
  }
  getCurrentModuleName() {
    return this.moduleName_;
  }
}
