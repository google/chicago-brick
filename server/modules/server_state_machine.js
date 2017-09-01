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

const ModuleDef = require('server/modules/module_def');
const RunningModule = require('server/modules/module');
const moduleTicker = require('server/modules/module_ticker');
const stateMachine = require('lib/state_machine');
const time = require('server/util/time');

const debug = require('debug')('wall:server_state_machine');
const library = require('server/modules/module_library');
const logError = require('server/util/log').error(debug);
const monitor = require('server/monitoring/monitor');

class ServerStateMachine extends stateMachine.Machine {
  constructor(wallGeometry) {
    super(new IdleState, debug);

    // The geometry of our region of the wall. A single Polygon.
    this.setContext({geo: wallGeometry});
  }
  nextModule(module, deadline) {
    if (monitor.isEnabled()) {
      monitor.update({server: {
        time: time.now(),
        event: `nextModule: ${module}`,
        deadline: deadline
      }});
    }
    this.state.nextModule(module, deadline);
  }
  handleError(error) {
    if (monitor.isEnabled()) {
      monitor.update({server: {
        time: time.now(),
        event: error.toString(),
      }});
    }
    
    logError(error);
    
    // Now, the machine is stopped (no transitions will have any effect, ever).
    // Also, we're either in the IdleState, or are trying to transition there.
    // Before we restart the machine, schedule a transition to ErrorState.
    this.transitionTo(new ErrorState);
    this.driveMachine();
  }
  restartMachineAfterError() {
    this.transitionTo(new IdleState);
  }
}

class IdleState extends stateMachine.State {
  enter(transition) {
    this.transition_ = transition;
    if (monitor.isEnabled()) {
      monitor.update({server: {
        time: time.now(),
        state: this.getName(),
      }});
    }
  }
  nextModule(module, deadline) {
    this.transition_(new PrepareState(new RunningModule(library.modules['_empty']), module, deadline));
  }
}

// Sink state. Machine can only change states via external transition.
class ErrorState extends stateMachine.State {
  enter() {
    if (monitor.isEnabled()) {
      monitor.update({server: {
        time: time.now(),
        state: this.getName(),
      }});
    }
  }
  nextModule(module, deadline) {}
}

class PrepareState extends stateMachine.State {
  constructor(oldModule, moduleName, deadline) {
    super('PrepareState');

    // The current module on the screen.
    this.oldModule_ = oldModule;

    // The moduleDef to load.
    this.moduleDef_ = library.modules[moduleName];

    // The new module.
    this.module_ = null;
    
    // The deadline at which we should transition to the new module.
    this.deadline_ = deadline;
    
    this.timer_ = null;
  }
  enter(transition, context) {
    if (monitor.isEnabled()) {
      monitor.update({server: {
        time: time.now(),
        state: this.getName(),
        deadline: this.deadline_
      }});
    }
    
    this.transition_ = transition;
    
    // The module we're trying to load.
    this.module_ = new RunningModule(this.moduleDef_, context.geo, this.deadline_);
    this.module_.instantiate();

    // Tell the old server module that it will be hidden soon.
    this.oldModule_.willBeHiddenSoon(this.deadline_);

    // Tell the server module that it will be shown soon.
    this.module_.willBeShownSoon(this.deadline_).then(() => {
      transition(new TransitionState(this.oldModule_, this.module_, this.deadline_));
    });
    
    // Schedule a timer to trip if we take too long. We'll transition anyway,
    // though.
    this.timer_ = setTimeout(() => {
      logError(new Error(`Preparation timeout for module ${this.moduleDef_.name}`));
      transition(new TransitionState(this.oldModule_, this.module_, this.deadline_));
    }, time.until(this.deadline_));
  }
  exit() {
    clearTimeout(this.timer_);
  }
  nextModule(module, deadline) {
    if (this.module_) {
      // If we are preparing to show some things, but then suddenly we're told
      // to go somewhere else, we need to meet the module interface contract by
      // telling the module that we are going to hide it at the old deadline.
      this.module_.willBeHiddenSoon(this.deadline_);
      
      // And because we're going to forget about this module after this point, we
      // really need to dispose of it.
      this.module_.dispose();
    }
    
    // Now, we're already told the old module that we are hiding it, 
    // and we'll tell it we're going to hide it again with a different deadline.
    // TODO(applmak): We should tighten up the API here to avoid the double
    // willBeHiddenSoon.
    this.transition_(new PrepareState(this.oldModule_, module, deadline));
  }
}

class TransitionState extends stateMachine.State {
  constructor(oldModule, module, deadline) {
    super();

    // The module that we're trying to unload.
    this.oldModule_ = oldModule;

    // The module we're trying to load.
    this.module_ = module;

    // The deadline at which we should start transitioning to the new module.
    this.deadline_ = deadline;

    this.timer_ = null;
  }
  enter(transition) {
    if (monitor.isEnabled()) {
      monitor.update({server: {
        time: time.now(),
        state: this.getName(),
        deadline: this.deadline_
      }});
    }
    
    this.transition_ = transition;
    // 5 second transition.
    let endTransition = this.deadline_ + 5000;
    this.timer_ = setTimeout(() => {
      moduleTicker.add(this.module_);

      this.timer_ = setTimeout(() => {
        moduleTicker.remove(this.oldModule_);
        
        this.transition_(new DisplayState(this.module_));
      }, time.until(endTransition));
    }, time.until(this.deadline_));
  }
  exit() {
    clearTimeout(this.timer_);
  }
  nextModule(module, deadline) {
    // Hmm... so, we are in the middle of transition from O -> N, and we just got asked to show M.
    // We need to prepare M for display, and then transition from O -> M, which is surely fine, guess.
    // But that means that we need to manually clean up N.
    this.module_.willBeHiddenSoon(deadline);
    moduleTicker.remove(this.module_);
    
    // Safely prepare the new module.
    this.transition_(new PrepareState(this.oldModule_, module, deadline));
  }
}

class DisplayState extends stateMachine.State {
  constructor(module) {
    super();

    // The module currently on display.
    this.module_ = module;
  }
  enter(transition) {
    if (monitor.isEnabled()) {
      monitor.update({server: {
        time: time.now(),
        state: this.getName(),
      }});
    }
    
    this.transition_ = transition;
  }
  nextModule(module, deadline) {
    this.transition_(new PrepareState(this.module_, module, deadline));
  }
}

module.exports = ServerStateMachine;
