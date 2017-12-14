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

const debug = require('debug')('wall:layout_state_machine');
const geometry = require('lib/geometry');

const stateMachine = require('lib/state_machine');
const time = require('server/util/time');
const ClientControlStateMachine = require('server/modules/client_control_state_machine');
const ModuleStateMachine = require('server/modules/module_state_machine');
const monitor = require('server/monitoring/monitor');

function isDisplayInPoly(rect, poly) {
  // find the center point of this display:
  var cx = rect.w / 2 + rect.x;
  var cy = rect.h / 2 + rect.y;

  return geometry.isInside(poly, cx, cy);
}

class LayoutStateMachine extends stateMachine.Machine {
  constructor() {
    super(new IdleState, debug);

    this.setContext({
      // All known clients. Maps client ID to ClientControlStateMachine.
      clients: {},
      module: null,
    });
  }
  newClient(clientInfo) {
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        event: `newClient: ${clientInfo.rect.serialize()}`,
      }});
    }
    this.context_.clients[clientInfo.socket.id] =
        new ClientControlStateMachine(clientInfo);
    this.state.newClient(clientInfo);
  }
  dropClient(id) {
    if (id in this.context_.clients) {
      let rect = this.context_.clients[id].getClientInfo().rect;
      if (monitor.isEnabled()) {
        monitor.update({layout: {
          time: time.now(),
          event: `dropClient: ${rect.serialize()}`,
        }});
      }
      this.state.dropClient(rect, id);
    } else {
      if (monitor.isEnabled()) {
        monitor.update({layout: {
          time: time.now(),
          event: `dropClient: id ${id}`,
        }});
      }
    }
    delete this.context_.clients[id];
  }
  fadeOut() {
    // Wipe the requested module.
    this.context_.module = null;
    
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        event: `fadeOut`,
      }});
    }
    
    return this.state.fadeOut();
  }
  getCurrentModuleInfo() {
    return this.state.getCurrentModuleInfo();
  }
  getClientState() {
    return Object.keys(this.context_.clients)
        .map(k => this.context_.clients[k])
        .map(c => {
          return {
            module: c.getModuleName(),
            rect: c.getClientInfo().rect,
            state: c.state.getName()
          };
        });
  }
  // Tell the state machines to play a module.
  playModule(moduleName) {
    debug(`playModule: ${moduleName}`);
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        event: `playModule: ${moduleName}`,
      }});
    }
    
    this.context_.module = moduleName;
    
    // Tell the current state that a request to play a module has arrived.
    return this.state.playModule(moduleName);
  }
}

class IdleState extends stateMachine.State {
  enter(transition) {
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        state: this.getName()
      }});
    }
    this.transition_ = transition;
  }
  newClient(client) {}
  dropClient(rect, id) {}
  getCurrentModuleInfo() {
    return {};
  }
  fadeOut() {
    // We can skip the normal fade out here because we're already faded out.
    return Promise.resolve();
  }
  playModule(moduleName) {
    // Start showing a thing!
    this.transition_(new DisplayState);
  }
}

class DisplayState extends stateMachine.State {
  enter(transition, context) {
    let deadline = time.now();
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        state: this.getName(),
        deadline: deadline,
      }});
    }
    
    this.transition_ = transition;
    
    // Make a module state machine (that manages the lifecycle of the module interface for both
    // client and server).
    this.moduleSM_ = new ModuleStateMachine(context.clients);

    this.moduleSM_.setErrorListener(error => {
      throw error;
    });
    
    // Tell the new module state machines to play any requested modules for this state (if any arrived
    // since we we were told to go here, say, during the fade).
    this.moduleSM_.playModule(context.module, deadline);
  }
  newClient(clientInfo) {
    this.moduleSM_.newClient(clientInfo);
  }
  dropClient(rect, id) {
    this.moduleSM_.dropClient(id);
  }
  fadeOut() {
    return new Promise(resolve => this.transition_(new FadeOutState(this.moduleSM_, resolve)));
  }
  playModule(moduleName) {
    this.moduleSM_.playModule(moduleName, time.now());
  }
  getCurrentModuleInfo() {
    return {
      state: this.moduleSM_.state.getName(),
      deadline: this.moduleSM_.getDeadline(),
    };
  }
}

class FadeOutState extends stateMachine.State {
  constructor(moduleSM, resolve) {
    super();
    
    this.moduleSM_ = moduleSM;
    
    this.timer_ = null;
    
    this.resolves_ = [resolve];
  }
  enter(transition) {
    let now = time.now();
    const FADE_OUT_DURATION = 5000;
    let deadline = now + FADE_OUT_DURATION;
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: now,
        state: this.getName(),
        deadline: deadline,
      }});
    }
    
    this.transition_ = transition;
    debug(`Fading out at ${deadline} ms`);
    this.moduleSM_.fadeToBlack(now);
    this.timer_ = setTimeout(() => {
      transition(new DisplayState);
      this.resolves_.forEach(r => r());
    }, time.until(deadline));
  }
  exit() {
    clearTimeout(this.timer_);
  }
  newClient(clientInfo) {}
  dropClient(id) {}
  fadeOut() {
    return new Promise(resolve => this.resolves_.push(resolve));
  }
  playModule(moduleName) {}
  getCurrentModuleInfo() {
    return {
      state: this.moduleSM_.state.getName(),
      deadline: Infinity,
    };
  }
}

module.exports = LayoutStateMachine;
