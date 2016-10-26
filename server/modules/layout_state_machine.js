/* Copyright 2015 Google Inc. All Rights Reserved.

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

require('lib/promise');
const _ = require('underscore');
const debug = require('debug')('wall:layout_state_machine');
const assert = require('lib/assert');

const logError = require('server/util/log').error(debug);
const stateMachine = require('lib/state_machine');
const time = require('server/util/time');
const wallGeometry = require('server/util/wall_geometry');
const ClientControlStateMachine = require('server/modules/client_control_state_machine');
const ModuleStateMachine = require('server/modules/module_state_machine');
const monitor = require('server/monitoring/monitor');

function describeLayout(partitions) {
  return partitions.map(moduleSM => ({
    geo: moduleSM.getGeo(),
    deadline: moduleSM.getDeadlineOfNextTransition(),
    state: moduleSM.state.getName(),
  }));
}

class LayoutStateMachine extends stateMachine.Machine {
  constructor() {
    super(new IdleState, debug);

    this.setContext({
      // All known clients. Maps client ID to ClientControlStateMachine.
      clients: {}
    });
  }
  handleError(error) {
    logError(error);
    this.transitionTo(new IdleState);
    this.driveMachine();
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
    } else {
      if (monitor.isEnabled()) {
        monitor.update({layout: {
          time: time.now(),
          event: `dropClient: id ${id}`,
        }});
      }
    }
    this.state.dropClient(id);
    delete this.context_.clients[id];
  }
  setPlaylist(layouts) {
    this.state.setLayouts(layouts);
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        event: `setPlaylist`,
      }});
    }
  }
  skipAhead() {
    this.state.skipAhead();
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        event: `skipAhead`,
      }});
    }
  }
  getPlaylist() {
    return this.state.getPlaylist();
  }
  getLayout() {
    return this.state.getLayout();
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
  playModule(moduleName) {
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        event: `playModule: ${moduleName}`,
      }});
    }
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
  dropClient(id) {}
  setLayouts(layouts) {
    this.transition_(new DisplayState(layouts, 0));
  }
  skipAhead() {}
  getPlaylist() {
    // TODO(applmak): Fix the playlist reporting to not depend on the layout.
    return {};
  }
  getLayout() {
    return {
      partitions: [],
      wall: wallGeometry.getGeo(),
    }
  }
  playModule(moduleName) {}
}

class DisplayState extends stateMachine.State {
  constructor(layouts, beginFadeInDeadline, index = 0) {
    super();
    
    this.layouts_ = layouts;
    this.index_ = index;
    
    assert(index < layouts.length);
    this.layout_ = layouts[index];
    
    this.timer_ = null;
    
    this.beginFadeInDeadline_ = beginFadeInDeadline;
  }
  enter(transition, context) {
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        state: this.getName(),
        deadline: this.beginFadeInDeadline_
      }});
    }
    
    this.transition_ = transition;
    this.partition_ = wallGeometry.partitionGeo(this.layout_.maxPartitions)
        .map(geo => new ModuleStateMachine(context.clients, geo));
    debug(`Fading ${this.partition_.length} layouts in at ${this.beginFadeInDeadline_}`);
    this.partition_.forEach(sm => sm.loadPlaylist(this.layout_, this.beginFadeInDeadline_));

    if (this.layouts_.length > 1) {
      this.timer_ = setTimeout(() => {
        transition(new FadeOutState(this.layouts_, this.index_, this.partition_));
      }, this.layout_.duration * 1000);
    }
  }
  exit() {
    clearTimeout(this.timer_);
  }
  newClient(clientInfo) {
    // Assign to a partition.
    let moduleSM = this.partition_.find(sm => sm.newClient(clientInfo));
    if (!moduleSM) {
      // Client tried to connect outside the wall geometry.
      throw new Error(`New client ${clientInfo.socket.id} has no module sm!`);
    }
  }
  dropClient(id) {
    this.partition_.forEach(m => m.dropClient(id));
  }
  skipAhead() {
    this.transition_(new FadeOutState(this.layouts_, this.index_, this.partition_));
  }
  setLayouts(layouts) {
    this.transition_(new FadeOutState(layouts, -1, this.partition_));
  }
  getPlaylist() {
    // TODO(applmak): Fix the playlist reporting to not depend on the layout.
    return {
      playlist: this.layouts_,
      index: this.index_,
    };
  }
  getLayout() {
    return {
      partitions: describeLayout(this.partition_),
      wall: wallGeometry.getGeo(),
    };
  }
  playModule(moduleName) {
    return this.partition_.some(sm => sm.playModule(moduleName));
  }
}

class FadeOutState extends stateMachine.State {
  constructor(layouts, index, partition) {
    super();
    
    this.layouts_ = layouts;
    this.index_ = index;
    this.partition_ = partition;
    
    assert(index < layouts.length);
    
    this.timer_ = null;
  }
  enter(transition) {
    let deadline = time.inFuture(5000);
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        state: this.getName(),
        deadline: deadline
      }});
    }
    
    this.transition_ = transition;
    debug(`Fading out ${this.partition_.length} layouts at ${deadline} ms`);
    this.partition_.forEach(sm => sm.fadeToBlack(deadline));
    this.timer_ = setTimeout(() => {
      let index = (this.index_ + 1) % this.layouts_.length;
      transition(new DisplayState(this.layouts_, deadline + 5000, index));
    }, 5000);
  }
  exit() {
    clearTimeout(this.timer_);
  }
  newClient(clientInfo) {}
  dropClient(id) {}
  skipAhead() {}
  setLayouts(layouts) {
    this.layouts_ = layouts;
    this.index_ = -1;
  }
  getPlaylist() {
    // TODO(applmak): Fix the playlist reporting to not depend on the layout.
    return {
      playlist: this.layouts_,
      index: this.index_,
    };
  }
  getLayout() {
    return {
      partitions: describeLayout(this.partition_),
      wall: wallGeometry.getGeo(),
    };
  }
  playModule(moduleName) {}
}

module.exports = LayoutStateMachine;
