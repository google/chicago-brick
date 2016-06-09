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
var debug = require('debug')('wall:server_state_machine');

var stateMachine = require('lib/state_machine');
var logError = require('server/util/log').error(debug);
var time = require('server/util/time');
var network = require('server/network/network');
var moduleTicker = require('server/modules/module_ticker');
const game = require('server/game/game');
const StateManager = require('server/state/state_manager');

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
    
    this.instance = this.moduleDef.instantiate(layoutGeometry, openNetwork, this.gamemanager, this.state, deadline);
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

var ServerStateMachine = function(wallGeometry) {
  stateMachine.Machine.call(this, debug, new IdleState);

  // The geometry of our region of the wall. A single Polygon.
  this.context_.wallGeometry = wallGeometry;
};
ServerStateMachine.prototype = Object.create(stateMachine.Machine.prototype);
ServerStateMachine.prototype.nextModule = function(moduleDef, deadline) {
  this.current_.nextModule(moduleDef, deadline);
};
ServerStateMachine.prototype.stop = function() {
  this.current_.stop();
};

var IdleState = function() {
  stateMachine.State.call(this, 'IdleState');
};
IdleState.prototype = Object.create(stateMachine.State.prototype);
IdleState.prototype.enter_ = function() {};
IdleState.prototype.nextModule = function(moduleDef, deadline) {
  this.transition_(new PrepareState(null, moduleDef, deadline));
};
IdleState.prototype.stop = function() {};

var PrepareState = function(oldModule, moduleDef, deadline) {
  stateMachine.State.call(this, 'PrepareState');

  // The current module on the screen.
  this.oldModule_ = oldModule;

  // The module to load.
  this.moduleDef_ = moduleDef;

  // The deadline at which we should transition to the new module.
  this.deadline_ = deadline;
};
PrepareState.prototype = Object.create(stateMachine.State.prototype);
PrepareState.prototype.enter_ = function() {
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
    this.transition_(new ErrorState());
  });
};
PrepareState.prototype.nextModule = function(moduleDef, deadline) {
  this.transition_(new PrepareState(this.oldModule_, moduleDef, deadline));
};
PrepareState.prototype.stop = function() {
  this.transition_(new IdleState());
};

var TransitionState = function(oldModule, module, deadline) {
  stateMachine.State.call(this, 'TransitionState');

  // The module that we're trying to unload.
  this.oldModule_ = oldModule;

  // The module we're trying to load.
  this.module_ = module;

  // The deadline at which we should transition to the new module.
  this.deadline_ = deadline;

  this.savedModuleDef_ = null;
  this.savedDeadline_ = 0;
};
TransitionState.prototype = Object.create(stateMachine.State.prototype);
TransitionState.prototype.enter_ = function() {
  // 5 second transition.
  var endTransition = this.deadline_ + 5000;
  // Time to transition, I think, but just in case, let's double-check.
  Promise.delay(time.until(this.deadline_)).done((function() {
    // TODO(applmak): Figure out if it's worth it to tell the server that we
    // are going to be fading in/out.
    // Tell the old server modules that they will be hidden soon.
    // modulesToTick.forEach((function(module) {
    //   module.beginFadeOut(this.deadline_);
    // }).bind(this));

    moduleTicker.add(this.module_);
    // this.module_.beginFadeIn(this.deadline_);

    debug('start transition', this.deadline_);
    Promise.delay(time.until(endTransition)).done((function() {
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
    }).bind(this));
  }).bind(this));
};
TransitionState.prototype.nextModule = function(moduleDef, deadline) {
  this.savedModuleDef_ = moduleDef;
  this.savedDeadline_ = deadline;
};
TransitionState.prototype.stop = function() {
  if (this.oldModule_) {
    moduleTicker.remove(this.oldModule_);
  }
  this.transition_(new IdleState());
};

var DisplayState = function(module) {
  stateMachine.State.call(this, 'DisplayState');

  // The module currently on display.
  this.module_ = module;
};
DisplayState.prototype = Object.create(stateMachine.State.prototype);
DisplayState.prototype.enter_ = function() {};
DisplayState.prototype.nextModule = function(moduleDef, deadline) {
  this.transition_(
      new PrepareState(this.module_, moduleDef, deadline));
};
DisplayState.prototype.stop = function() {
  if (this.module_) {
    moduleTicker.remove(this.module_);
  }
  this.transition_(new IdleState());
};

var ErrorState = function() {
  stateMachine.State.call(this, 'ErrorState');
};
ErrorState.prototype = Object.create(stateMachine.State.prototype);
ErrorState.prototype.enter_ = function() {};
ErrorState.prototype.nextModule = function(moduleDef, deadline) {
  this.transition_(new PrepareState(null, moduleDef, deadline));
};
ErrorState.prototype.stop = function() {
  this.transition_(new IdleState());
};

module.exports = ServerStateMachine;
