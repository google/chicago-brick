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

define(function(require) {
  'use strict';
  require('lib/promise');

  var stateMachine = require('lib/state_machine');
  var timeManager = require('client/util/time');
  var ClientModule = require('client/modules/module');
  var debug = require('client/util/debug')('wall:client_state_machine');

  // The PrepareState gives the client module time to load assets. From the
  // beginning of the state, the module has about 60 seconds to load everything
  // it has to load. If it finishes earlier, it should resolve its
  // willBeShownSoon promise. If it's asked to prepare something while it's
  // preparing, we queue that up, finish our prepare, and then prepare the new
  // module.
  class PrepareState extends stateMachine.State {
    constructor(oldModule, module) {
      super('PrepareState');

      this.oldModule_ = oldModule;
      this.module_ = module.instantiate();
    }
    enter_() {
      // Tell the modules that we're going to switch soon.
      this.oldModule_.willBeHiddenSoon();
      if (!this.module_.willBeShownSoon()) {
        // Error in new module code...We can't go back to just
        // displaying the old module because we already told it we'll be done
        // with it soon. Instead, clean up, then setup a transition to empty.
        this.module_.dispose();
        this.module_ = ClientModule.newEmptyModule(this.module_.deadline);
        debug('Transitioning to empty module due to willBeShownSoon exception.');
      }
      Promise.delay(timeManager.until(this.module_.deadline)).done(() => {
        this.transition_(new TransitionState(this.oldModule_, this.module_));
      });
    }
    nextModule(module) {
      // Suddenly, we aren't going to be fading from old -> current, and should 
      // instead be showing new. But we've already told old and current to get
      // ready to be hidden & shown (and old is likely still ticking). We should
      // immediately tell current that it's going to be hidden, and then dispose
      // of it. Then, we should prepare to transition from old -> new, skipping
      // current. This ensures that everything gets disposed correctly and we
      // still meet the module interface contract.
      this.module_.willBeHiddenSoon();
      this.module_.dispose();
      
      this.transition_(new PrepareState(this.oldModule_, module));
    }
  }

  // This state manages a transition between two modules. The tricky part is
  // that the transition must happen sync'd across all clients.
  class TransitionState extends stateMachine.State {
    constructor(oldModule, module) {
      super('TransitionState');

      // The module to fade out.
      this.oldModule_ = oldModule;

      // The module to fade in.
      this.module_ = module;

      // If while in the middle of a transition, we get a request to go
      // somewhere else, we save that, and do so asap.
      this.savedModule_ = null;
    }
    enter_() {
      var fadeDeadline = this.module_.deadline + 5000;

      // Start the transition!
      this.oldModule_.fadeOut(fadeDeadline);
      if (!this.module_.fadeIn(fadeDeadline)) {
        this.module_.dispose();
        this.module_ = ClientModule.newEmptyModule(this.module_.deadline);
        debug('Transitioning to empty module due to fadeIn exception.');
      }

      // Wait until the deadline.
      Promise.delay(timeManager.until(fadeDeadline)).done(() => {
        this.oldModule_.dispose();

        if (this.savedModule_) {
          // Concurrent request to change to new module!
          this.transition_(new PrepareState(this.module_, this.savedModule_));
        } else {
          // Otherwise, display the module!
          this.transition_(new DisplayState(this.module_));
        }
      });
    }
    nextModule(module) {
      this.savedModule_ = module;
    }
  }

  // Displays a module until told to show a new one.
  class DisplayState extends stateMachine.State {
    constructor(module) {
      super('DisplayState');
      this.module_ = module;
    }
    enter_() {}
    nextModule(module) {
      this.transition_(new PrepareState(this.module_, module));
    }
  }

  class ClientStateMachine extends stateMachine.Machine {
    constructor() {
      super(debug, new DisplayState(ClientModule.newEmptyModule(0)));
    }
    nextModule(module) {
      debug('Requested transition to module', module.name);
      this.current_.nextModule(module);
    }
  }

  return ClientStateMachine;
});
