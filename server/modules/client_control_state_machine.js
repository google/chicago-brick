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

'use strict';

import * as wallGeometry from '../util/wall_geometry.js';
import Debug from 'debug';
import library from './module_library.js';
import {State, StateMachine} from '../../lib/state_machine.js';
import {error} from '../util/log.js';
import {until} from '../util/time.js';

const debug = Debug('wall:client_control_state_machine');
const logError = error(debug);

export class ClientControlStateMachine extends StateMachine {
  constructor(client) {
    super(new IdleState, debug);

    // Assign client socket to context so that states can communicate with the
    // client.
    this.setContext({client});
  }
  playModule(module, deadline) {
    this.state.playModule(module, deadline);
  }
  handleError(error) {
    logError(error);
    // It's unexpected that we'll ever get into an error state here. If we do, we transition immediately to Idle and await further instructions.
    this.transitionTo(new IdleState);
    // Re-enable the state machine.
    this.driveMachine();
  }
  getModuleName() {
    return this.state.getModuleName();
  }
  getClientInfo() {
    return this.context_.client;
  }
}

class IdleState extends State {
  enter(transition) {
    this.transition_ = transition;
  }
  playModule(module, deadline) {
    this.transition_(new PrepareState(module, deadline));
  }
  getModuleName() {
    return '<None>';
  }
}

class PrepareState extends State {
  constructor(module, deadline) {
    super();

    // Server-side module info.
    this.moduleDef_ = library.modules[module];

    // The deadline at which we should transition to the new module.
    this.deadline_ = deadline;

    this.timer_ = null;
  }
  enter(transition, context) {
    this.transition_ = transition;
    let client = context.client;

    // Tell the client to load the relevant module.
    client.socket.emit('loadModule', {
      module: this.moduleDef_.serializeForClient(),
      time: this.deadline_,
      geo: wallGeometry.getGeo().points
    });

    this.timer_ = setTimeout(() => {
      transition(new DisplayState(this.moduleDef_.name));
    }, until(this.deadline_));
  }
  exit() {
    clearTimeout(this.timer_);
  }
  playModule(module, deadline) {
    // Even if waiting for the client to do something, prepare a new module
    // immediately.
    this.transition_(new PrepareState(module, deadline));
  }
  getModuleName() {
    return this.moduleDef_.name;
  }
}

class DisplayState extends State {
  constructor(moduleName) {
    super();
    this.moduleName_ = moduleName;
  }
  enter(transition) {
    this.transition_ = transition;
  }
  playModule(module, deadline) {
    this.transition_(new PrepareState(module, deadline));
  }
  getModuleName() {
    return this.moduleName_;
  }
}
