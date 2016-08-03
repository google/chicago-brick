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
const debug = require('debug')('wall:server_state_machine');
const game = require('server/game/game');
const logError = require('server/util/log').error(debug);
const moduleTicker = require('server/modules/module_ticker');
const network = require('server/network/network');
const stateMachine = require('lib/state_machine');
const time = require('server/util/time');


class RunningModule {
  constructor(moduleDef) {
    this.moduleDef = moduleDef;
    this.instance = null;
  }

  instantiate(layoutGeometry, deadline) {
    const INSTANTIATION_ID = `${layoutGeometry.extents.serialize()}-${deadline}`;
    this.network = network.forModule(INSTANTIATION_ID);
    this.gameManager = game.forModule(INSTANTIATION_ID);

    var openNetwork = this.network.open();
    this.state = new StateManager(openNetwork);
    
    this.instance = this.moduleDef.instantiate(layoutGeometry, openNetwork, this.gameManager, this.state, deadline);
  }

  tick(now, delta) {
    this.instance.tick(now, delta);
    this.state.send();
  }

  dispose() {
    this.instance.dispose();

    // Also clean up a stray singleton.
    this.network.close();

    // Clean up game sockets.
    this.gameManager.dispose();
  }
}

class ServerStateMachine extends stateMachine.Machine {
  constructor(wallGeometry) {
    super(debug, new IdleState);

    // The geometry of our region of the wall. A single Polygon.
    this.context_.wallGeometry = wallGeometry;
  }
  nextModule(moduleDef, deadline) {
    this.current_.nextModule(moduleDef, deadline);
  }
  stop() {
    this.current_.stop();
  }
}

class IdleState extends stateMachine.State {
  constructor() {
    super('IdleState');
  }
  enter_() {}
  nextModule(moduleDef, deadline) {
    this.transition_(new PrepareState(null, moduleDef, deadline));
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

    // The deadline at which we should transition to the new module.
    this.deadline_ = deadline;
  }
  enter_() {
    // The module we're trying to load.
    this.module_ = new RunningModule(this.moduleDef_);
    this.module_.instantiate(this.context_.wallGeometry, this.deadline_);

    // Tell the old server module that it will be hidden soon.
    if (this.oldModule_) {
      this.oldModule_.instance.willBeHiddenSoon(this.deadline_);
    }

    // Tell the server module that it will be shown soon.
    // TODO(applmak): Implement a timeout that works.
    this.module_.instance.willBeShownSoon(this.deadline_);
    Promise.resolve().done(() => {
      this.transition_(new TransitionState(
          this.oldModule_, this.module_, this.deadline_));
    }, (e) => {
      logError(e);
      debug('Entering error state for module ' + this.module_.moduleDef.name);
      this.transition_(new ErrorState);
    });
  }
  nextModule(moduleDef, deadline) {
    this.transition_(new PrepareState(this.oldModule_, moduleDef, deadline));
  }
  stop() {
    this.transition_(new IdleState);
  }
}

class TransitionState extends stateMachine.State {
  constructor(oldModule, module, deadline) {
    super('TransitionState');

    // The module that we're trying to unload.
    this.oldModule_ = oldModule;

    // The module we're trying to load.
    this.module_ = module;

    // The deadline at which we should transition to the new module.
    this.deadline_ = deadline;

    this.savedModuleDef_ = null;
    this.savedDeadline_ = 0;
  }
  enter_() {
    // 5 second transition.
    var endTransition = this.deadline_ + 5000;
    // Time to transition, I think, but just in case, let's double-check.
    Promise.delay(time.until(this.deadline_)).done(() => {
      // TODO(applmak): Figure out if it's worth it to tell the server that we
      // are going to be fading in/out.
      // Tell the old server modules that they will be hidden soon.
      // modulesToTick.forEach((function(module) {
      //   module.beginFadeOut(this.deadline_);
      // }).bind(this));

      moduleTicker.add(this.module_);
      // this.module_.beginFadeIn(this.deadline_);

      debug('start transition', this.deadline_);
      Promise.delay(time.until(endTransition)).done(() => {
        debug('end transition', endTransition);

        if (this.oldModule_) {
          moduleTicker.remove(this.oldModule_);
        }
        // this.module_.finishFadeIn();

        if (this.savedModuleDef_) {
          this.transition_(new PrepareState(
              this.module_, this.savedModuleDef_, this.savedDeadline_));
        } else {
          this.transition_(new DisplayState(this.module_));
        }
      });
    });
  }
  nextModule(moduleDef, deadline) {
    this.savedModuleDef_ = moduleDef;
    this.savedDeadline_ = deadline;
  }
  stop() {
    if (this.oldModule_) {
      moduleTicker.remove(this.oldModule_);
    }
    this.transition_(new IdleState);
  }
}

class DisplayState extends stateMachine.State {
  constructor(module) {
    super('DisplayState');

    // The module currently on display.
    this.module_ = module;
  }
  enter_() {}
  nextModule(moduleDef, deadline) {
    this.transition_(
        new PrepareState(this.module_, moduleDef, deadline));
  }
  stop() {
    if (this.module_) {
      moduleTicker.remove(this.module_);
    }
    this.transition_(new IdleState);
  }
}

class ErrorState extends stateMachine.State {
  constructor() {
    super('ErrorState');
  }
  enter_() {}
  nextModule(moduleDef, deadline) {
    this.transition_(new PrepareState(null, moduleDef, deadline));
  }
  stop() {
    this.transition_(new IdleState);
  }
}

module.exports = ServerStateMachine;
