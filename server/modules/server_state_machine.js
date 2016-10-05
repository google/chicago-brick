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

const StateManager = require('server/state/state_manager');
const assert = require('lib/assert');
const game = require('server/game/game');
const moduleTicker = require('server/modules/module_ticker');
const network = require('server/network/network');
const stateMachine = require('lib/state_machine2');
const time = require('server/util/time');

const debug = require('debug')('wall:server_state_machine');
const logError = require('server/util/log').error(debug);

class RunningModule {
  static newEmptyModule() {
    return new RunningModule;
  }
  constructor(moduleDef, geo, deadline) {
    this.moduleDef = moduleDef;
    this.geo = geo;
    this.deadline = deadline;
    
    if (this.moduleDef) {
      const INSTANTIATION_ID = `${geo.extents.serialize()}-${deadline}`;
      this.network = network.forModule(INSTANTIATION_ID);
      this.gameManager = game.forModule(INSTANTIATION_ID);
    }
  }
  
  // This is a separate method in order to guard against exceptions in 
  // instantiate.
  instantiate() {
    if (this.moduleDef) {
      let openNetwork = this.network.open();
      this.stateManager = new StateManager(openNetwork);
      this.instance = this.moduleDef.instantiate(this.geo, openNetwork, this.gameManager, this.stateManager, this.deadline);
    }
  }

  tick(now, delta) {
    if (this.instance) {
      this.instance.tick(now, delta);
      this.stateManager.send();
    }
  }

  dispose() {
    if (this.instance) {
      this.instance.dispose();
    }
    if (this.moduleDef) {
      // Clean up game sockets.
      this.gameManager.dispose();
    
      // This also cleans up stateManager.
      this.network.close();
    }
  }
  
  willBeHiddenSoon(deadline) {
    if (this.instance) {
      this.instance.willBeHiddenSoon(deadline);
    }
  }
  
  willBeShownSoon(deadline) {
    if (this.instance) {
      let ret = this.instance.willBeShownSoon(deadline);
      if (!ret) {
        logError(new Error(`Module ${this.moduleDef.name} should return a promise from willBeShownSoon`));
        return Promise.resolve();
      }
      return ret;
    }
    return Promise.resolve();
  }
}

class ServerStateMachine extends stateMachine.Machine {
  constructor(wallGeometry) {
    super(new IdleState, debug);

    // The geometry of our region of the wall. A single Polygon.
    this.setContext({geo: wallGeometry});
  }
  nextModule(moduleDef, deadline) {
    this.state.nextModule(moduleDef, deadline);
  }
  stop() {
    this.state.stop();
  }
  handleError(error) {
    logError(error);
    // Tell machine to stop (the behavior of which changes depending on the
    // current state).
    this.stop();
    // Restart the machine.
    this.driveMachine();
  }
}

class IdleState extends stateMachine.State {
  enter(transition) {
    this.transition_ = transition;
  }
  nextModule(moduleDef, deadline) {
    this.transition_(new PrepareState(RunningModule.newEmptyModule(), moduleDef, deadline));
  }
  stop() {}
}

class PrepareState extends stateMachine.State {
  constructor(oldModule, moduleDef, deadline) {
    super('PrepareState');

    // The current module on the screen.
    this.oldModule_ = oldModule;

    // The module to load.
    this.moduleDef_ = moduleDef;

    // The new module.
    this.module_ = null;
    
    // The deadline at which we should transition to the new module.
    this.deadline_ = deadline;
    
    this.timer_ = null;
  }
  enter(transition, context) {
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
  nextModule(moduleDef, deadline) {
    // If we are preparing to show some things, but then suddenly we're told
    // to go somewhere else, we need to meet the module interface contract by
    // telling the module that we are going to hide it at the old deadline.
    this.module_.willBeHiddenSoon(this.deadline_);
    
    // Now, we're already told the old module that we are hiding it, 
    // and we'll tell it we're going to hide it again with a different deadline.
    // TODO(applmak): We should tighten up the API here to avoid the double
    // willBeHiddenSoon.
    this.transition_(new PrepareState(this.oldModule_, moduleDef, deadline));
  }
  stop() {
    this.transition_(new IdleState);
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

    this.savedModuleDef_ = null;
    this.savedDeadline_ = 0;
  }
  enter(transition) {
    this.transition_ = transition;
    // 5 second transition.
    let endTransition = this.deadline_ + 5000;
    this.timer_ = setTimeout(() => {
      moduleTicker.add(this.module_);

      this.timer_ = setTimeout(() => {
        moduleTicker.remove(this.oldModule_);
        
        if (this.savedModuleDef_) {
          this.transition_(new PrepareState(
              this.module_, this.savedModuleDef_, this.savedDeadline_));
        } else {
          this.transition_(new DisplayState(this.module_));
        }
      }, time.until(endTransition));
    }, time.until(this.deadline_));
  }
  exit() {
    clearTimeout(this.timer_);
  }
  nextModule(moduleDef, deadline) {
    this.savedModuleDef_ = moduleDef;
    this.savedDeadline_ = deadline;
  }
  stop() {
    // When we're in the middle of a transition, we have to stop both modules.
    this.oldModule_.willBeHiddenSoon(0);
    this.module_.willBeHiddenSoon(0);
    moduleTicker.remove(this.oldModule_);
    moduleTicker.remove(this.module_);
    this.transition_(new IdleState);
  }
}

class DisplayState extends stateMachine.State {
  constructor(module) {
    super();

    // The module currently on display.
    this.module_ = module;
  }
  enter(transition) {
    this.transition_ = transition;
  }
  nextModule(moduleDef, deadline) {
    this.transition_(new PrepareState(this.module_, moduleDef, deadline));
  }
  stop() {
    this.module_.willBeHiddenSoon(0);
    moduleTicker.remove(this.module_);
    this.transition_(new IdleState);
  }
}

module.exports = ServerStateMachine;
