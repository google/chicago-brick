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

define(function(require) {
  'use strict';
  require('lib/promise');

  const ClientModule = require('client/modules/module');
  const stateMachine = require('lib/state_machine');
  const timeManager = require('client/util/time');

  const debug = require('debug')('wall:client_state_machine');
  const logError = require('client/util/log').error(debug);
  const monitor = require('client/monitoring/monitor');

  // The PrepareState gives the client module time to load assets. From the
  // beginning of the state, the module has about 60 seconds to load everything
  // it has to load. If it finishes earlier, it should resolve its
  // willBeShownSoon promise. If it's asked to prepare something while it's
  // preparing, we queue that up, finish our prepare, and then prepare the new
  // module.
  class PrepareState extends stateMachine.State {
    constructor(oldModule, module) {
      super();

      // Currently showing...
      this.oldModule_ = oldModule;
      
      // Next one to get ready.
      this.module_ = module;
      
      // Set to true when the module is fully instantiated.
      this.moduleIsReady_ = false;
      
      // Set to true if a request to transition away has occurred.
      this.willTransitionAway_ = false;
      
      // Timer
      this.timer_ = null;
    }
    enter(transition) {
      if (monitor.isEnabled()) {
        monitor.update({client:{
          state: this.getName(),
          time: timeManager.now(),
          deadline: this.module_.deadline
        }});
      }
      this.transition_ = transition;
      
      // First, tell the old module that we're going to hide it.
      this.oldModule_.willBeHiddenSoon();
      
      // Tell the new module to instantiate, which may require loading deps.
      let moduleDone = this.module_.instantiate().then(() => {
        if (this.willTransitionAway_) {
          // We're leaving... don't init the module any further.
          this.module_.dispose();
          return;
        }
        // Now that it's loaded, tell it that it will be shown soon.
        if (!this.module_.willBeShownSoon()) {
          // Error in new module code...We can't go back to just
          // displaying the old module because we already told it we'll be done
          // with it soon. Instead, clean up, then pass control back to the 
          // machine via its error handler.
          this.module_.dispose();
          throw new Error(`Failed to prepare from ${this.oldModule_.name} to ${this.module_.name}`);
        }
        this.moduleIsReady_ = true;
      });
      
      // Tell the modules that we're going to switch soon.
      debug('Delaying in prepare state for ' + timeManager.until(this.module_.deadline));
      this.timer_ = setTimeout(() => {
        if (!this.module_.instance) {
          debug('Attempted to transition to module that did not init in time!');
        }
        moduleDone.then(() => {
          transition(new TransitionState(this.oldModule_, this.module_));
        });
      }, timeManager.until(this.module_.deadline));
    }
    exit() {
      // Clear any pending transition.
      clearTimeout(this.timer_);
    }
    playModule(module) {
      this.willTransitionAway_ = true;
      
      // Suddenly, we aren't going to be fading from old -> current, and should 
      // instead be showing new. But we've already told old and current to get
      // ready to be hidden & shown (and old is likely still ticking). We should
      // immediately tell current that it's going to be hidden, and then dispose
      // of it. Then, we should prepare to transition from old -> new, skipping
      // current. This ensures that everything gets disposed correctly and we
      // still meet the module interface contract.
      if (this.moduleIsReady_) {
        this.module_.willBeHiddenSoon();
        this.module_.dispose();
      } else if (this.module_.instance) {
        // The module isn't yet ready, but it's currently loading.
        // We'll rely on the loader to handle this error case.
      } else {
        // Happened before enter, even. No work to do.
      }
      
      this.transition_(new PrepareState(this.oldModule_, module));
    }
  }

  // This state manages a transition between two modules. The tricky part is
  // that the transition must happen sync'd across all clients.
  class TransitionState extends stateMachine.State {
    constructor(oldModule, module) {
      super();

      // The module to fade out.
      this.oldModule_ = oldModule;

      // The module to fade in.
      this.module_ = module;

      // If while in the middle of a transition, we get a request to go
      // somewhere else, we save that, and do so asap.
      this.savedModule_ = null;
      
      // Timer.
      this.timer_ = null;
    }
    enter(transition) {
      // Give ourselves 5 seconds to fade.
      let fadeDeadline = this.module_.deadline + 5000;

      if (monitor.isEnabled()) {
        monitor.update({client: {
          state: this.getName(),
          time: timeManager.now(),
          deadline: fadeDeadline
        }});
      }
      
      // Start the transition!
      this.oldModule_.fadeOut(fadeDeadline);
      if (!this.module_.fadeIn(fadeDeadline)) {
        this.module_.dispose();
        // Throw, so that the state machine catches the exception.
        throw new Error(`Failed to transition from ${this.oldModule_.name} to ${this.module_.name}`);
      }

      // Wait until the visual effect is complete.
      this.timer_ = setTimeout(() => {
        this.oldModule_.dispose();

        // While we were doing the effect, we received a request for a new
        // module. Prepare that one now.
        if (this.savedModule_) {
          // Concurrent request to change to new module!
          transition(new PrepareState(this.module_, this.savedModule_));
        } else {
          // Otherwise, display the module!
          transition(new DisplayState(this.module_));
        }
      }, timeManager.until(fadeDeadline));
    }
    exit() {
      // Clear any timeout set.
      clearTimeout(this.timer_);
    }
    playModule(module) {
      this.savedModule_ = module;
    }
  }

  // Displays a module until told to show a new one.
  class DisplayState extends stateMachine.State {
    constructor(module) {
      super();
      this.module_ = module;
    }
    enter(transition) {
      this.transition_ = transition;
      if (monitor.isEnabled()) {
        monitor.update({client: {
          state: this.getName(),
          time: timeManager.now()
        }});
      }
    }
    playModule(module) {
      this.transition_(new PrepareState(this.module_, module));
    }
  }

  class ClientStateMachine extends stateMachine.Machine {
    constructor() {
      // Initially, we tell the clients to show a blank screen.
      super(new DisplayState(ClientModule.newEmptyModule()), debug);
      
      this.setErrorListener(error => {
        if (monitor.isEnabled()) {
          monitor.update({client: {
            event: error.toString(),
            time: timeManager.now(),
            color: [255, 0, 0]
          }});
        }
        
        logError(error);
      });
    }
    playModule(module) {
      if (monitor.isEnabled()) {
        monitor.update({client: {
          event: `playModule: ${module.name}`,
          time: timeManager.now(),
          deadline: module.deadline
        }});
      }
      
      debug('Requested transition to module', module.name);
      // Transition according to current state rules.
      this.state.playModule(module);
    }
  }

  return ClientStateMachine;
});
