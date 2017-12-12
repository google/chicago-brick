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

    // The partition we're trying to show next.
    this.partition_ = null;

    this.setContext({
      // All known clients. Maps client ID to ClientControlStateMachine.
      clients: {},
      // Array of playlist index -> module name
      modules: [],
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
  setPartition(partition) {
    // The partition specifies polygons that divide the wall into independent spheres of control.
    this.partition_ = partition;
    
    // Wipe the requested modules, as the number of partitions could easily change between set calls.
    this.context_.modules.length = 0;
    
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        event: `setPartition: ${partition.length}`,
      }});
    }
    
    // Tell the wall to fade out and switch to this new partitioning scheme.
    return this.state.fadeOut(partition);
  }
  getPartition() {
    return this.partition_;
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
  // Tell a partition to play a module.
  playModule(partitionIndex, moduleName) {
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        event: `playModule: ${partitionIndex} ${moduleName}`,
      }});
    }
    
    this.context_.modules[partitionIndex] = moduleName;
    
    // Tell the current state that a new partition has arrived.
    return this.state.playModule(partitionIndex, moduleName);
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
    return [];
  }
  fadeOut(partition) {
    // We can skip the normal fade out here because we're already faded out.
    this.transition_(new PartitionState(partition));
    return Promise.resolve();
  }
  playModule(partitionIndex, moduleName) {}
}

class PartitionState extends stateMachine.State {
  constructor(partition) {
    super();
    
    // Array of polygons that define the layout.
    this.partition_ = partition;
  }
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
    // client and server) for each partition.
    this.moduleSMs_ = this.partition_.map(geo => new ModuleStateMachine(context.clients, geo));

    // TODO(applmak): Add information to this error such as which partition gave the error.
    this.moduleSMs_.forEach(msm => msm.setErrorListener(error => {
      throw error;
    }));
    
    // Tell the new module state machines to play any requested modules for this state (if any arrived
    // since we we were told to go here, say, during the fade).
    this.moduleSMs_.forEach((msm, i) => {
      if (context.modules[i]) {
        msm.playModule(context.modules[i], deadline);
      }
    });
    
    // We're done until a new partition arrives.
  }
  newClient(clientInfo) {
    // Assign to a partition.
    let index = this.partition_.findIndex(geo => isDisplayInPoly(clientInfo.rect, geo));
    if (index == -1) {
      // Client tried to connect outside the wall geometry.
      throw new Error(`New client ${clientInfo.socket.id} is not inside of the wall!`);
    }
    this.moduleSMs_[index].newClient(clientInfo);
  }
  dropClient(rect, id) {
    let index = this.partition_.findIndex(geo => isDisplayInPoly(rect, geo));
    if (index == -1) {
      // Client tried to drop outside the known wall geometry... weird.
      throw new Error(`Client ${id} is not inside of the wall!`);
    }
    this.moduleSMs_[index].dropClient(id);
  }
  fadeOut(partition) {
    return new Promise(resolve => this.transition_(new FadeOutState(partition, this.moduleSMs_, resolve)));
  }
  playModule(partitionIndex, moduleName) {
    this.moduleSMs_[partitionIndex].playModule(moduleName, time.now());
  }
  getCurrentModuleInfo() {
    return this.moduleSMs_.map(msm => ({
      state: msm.state.getName(),
      deadline: msm.getDeadline(),
    }));
  }
}

class FadeOutState extends stateMachine.State {
  constructor(partition, moduleSMs, resolve) {
    super();
    
    this.partition_ = partition;
    this.moduleSMs_ = moduleSMs;
    
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
    debug(`Fading out ${this.partition_.length} layouts at ${deadline} ms`);
    this.moduleSMs_.forEach(sm => sm.fadeToBlack(now));
    this.timer_ = setTimeout(() => {
      transition(new PartitionState(this.partition_));
      this.resolves_.forEach(r => r());
    }, time.until(deadline));
  }
  exit() {
    clearTimeout(this.timer_);
  }
  newClient(clientInfo) {}
  dropClient(id) {}
  fadeOut(partition) {
    this.partition_ = partition;
    return new Promise(resolve => this.resolves_.push(resolve));
  }
  playModule(partitionIndex, moduleName) {}
  getCurrentModuleInfo() {
    return this.moduleSMs_.map(msm => ({
      state: msm.state.getName(),
      deadline: Infinity,
    }));
  }
}

module.exports = LayoutStateMachine;
