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
  var debug = require('client/util/debug')('wall:client_state_machine');
  var moduleTicker = require('client/modules/module_ticker');
  var info = require('client/util/info');
  var error = require('client/util/log').error(debug);
  var asset = require('client/asset/asset');
  
  function makeNewContainer() {
    var newContainer = document.createElement('div');
    newContainer.className = 'container';
    newContainer.id = 't-' + timeManager.now();
    newContainer.style.opacity = 0.0;
    return newContainer;
  }
  
  class ClientStateMachine extends stateMachine.Machine {
    constructor() {
      super('ClientStateMachine', new IdleState);
    }
    nextModule(module, instance, globals, deadline) {
      debug('Requested transition to module', module.name);
      this.current_.nextModule(module, instance, globals, deadline);
    }
  }
  
  // When the client is idling, it's not displaying anything, or doing anything.
  // A request from the server to go to the next module transitions to the
  // prepare state.
  class IdleState extends stateMachine.State {
    constructor() {
      super('IdleState');
    }
    enter_() {}
    nextModule(meta, module, globals, deadline) {
      this.transition_(new PrepareState(null, meta, module, globals, deadline));
    }
  }
  
  // The PrepareState gives the client module time to load assets. From the
  // beginning of the state, the module has about 60 seconds to load everything
  // it has to load. If it finishes earlier, it should resolve its
  // willBeShownSoon promise. If it's asked to prepare something while it's
  // preparing, we queue that up, finish our prepare, and then prepare the new
  // module.
  class PrepareState extends stateMachine.State {
    constructor(oldModule, meta, module, globals, deadline) {
      super('PrepareState');

      this.oldModule_ = oldModule;
      this.meta_ = meta;
      this.module_ = module;
      this.globals_ = globals;
      this.deadline_ = deadline;
    }
    enter_() {
      this.globals_._container = makeNewContainer();
      document.querySelector('#containers')
          .appendChild(this.globals_._container);

      // Tell the modules that we're going to switch soon.
      if (this.oldModule_) {
        try {
          this.oldModule_.willBeHiddenSoon();
        } catch (e) {
          // If the thing we are trying to clean up is borked, no big deal,
          // just continue.
          console.error('Error in willBeHiddenSoon');
          error(e);
        }
      }
      try {
        this.module_.willBeShownSoon(this.globals_._container, this.deadline_);
      } catch (e) {
        // Error in new module code... don't crash. We can't go back to just 
        // displaying the old module because we already told it we'll be done 
        // with it soon. Instead, clean up, then transition to idle.
        this.globals_._container.remove();
        this.globals_._container = null;
        console.error(`Error in willBeShownSoon (${this.meta_.name})`);
        error(e);
        this.transition_(new TransitionState(this.oldModule_, null, null, null, this.deadline_));
        return;
      }

      Promise.delay(timeManager.until(this.deadline_)).done(() => {
        this.transition_(new TransitionState(
            this.oldModule_, this.meta_, this.module_, this.globals_, this.deadline_));
      });
    }
    nextModule(meta, module, globals, deadline) {
      this.transition_(
          new PrepareState(this.module_, meta, module, globals, deadline));
    }
  }
  
  // This state manages a transition between two modules. The tricky part is
  // that the transition must happen sync'd across all clients.
  class TransitionState extends stateMachine.State {
    constructor(oldModule, meta, module, globals, deadline) {
      super('TransitionState');

      // The module to fade out.
      this.oldModule_ = oldModule;
      
      // Metadata about the module.
      this.meta_ = meta;
      
      // The module to fade in.
      this.module_ = module;
    
      // The module-globals.
      this.globals_ = globals;

      // The deadline that we need to start the transition.
      this.deadline_ = deadline;
    
      // If while in the middle of a transition, we get a request to go
      // somewhere else, we save that, and do so asap.
      this.savedModule_ = null;
      this.savedGlobals_ = null;
      this.savedDeadline_ = 0;
    }
    enter_() {
      var endDeadline = this.deadline_ + 5000;
      // Wait until the start deadline has passed.
      Promise.delay(timeManager.until(this.deadline_)).then(() => {
        debug('start fade', this.deadline_);
        // Start the transition!
        if (this.oldModule_) {
          try {
            this.oldModule_.beginFadeOut(this.deadline_);
          } catch (e) {
            // If the thing we are trying to clean up is borked, no big deal,
            // just continue.
            console.error('Error in beginFadeOut');
            error(e);
          }
        }
        if (this.module_) {
          try {
            this.module_.beginFadeIn(this.deadline_);
          } catch (e) {
            this.globals_._container.remove();
            this.globals_._container = null;
            console.error(`Error in beginFadeIn (${this.meta_.name})`);
            error(e);
            this.module_ = null;
          }
        }
        if (this.module_) {
          // Now that we told the new module it's going to fade in, start
          // drawing it.
          moduleTicker.add(this.module_, this.globals_);
    
          // Perform the transition
          let container = this.globals_._container;
          container.style.transition =
              'opacity ' + timeManager.until(endDeadline).toFixed(0) + 'ms';
          container.style.opacity = 1.0;
        } else {
          // If there's no module, we'll fade out the old container, if any.
          // TODO(applmak): Make this less hacky by collecting module 
          // information into a single class (like RunningModule on the server).
          let container = document.querySelector('#containers').firstChild;
          if (container) {
            container.style.transition =
                'opacity ' + timeManager.until(endDeadline).toFixed(0) + 'ms';
            container.style.opacity = 0.0;
          }
        }

        // Wait until the deadline.
        return Promise.delay(timeManager.until(endDeadline));
      }).done(() => {
        debug('end fade', endDeadline);
        
        if (this.oldModule_) {
          moduleTicker.remove(this.oldModule_);
        }
        if (this.module_) {
          this.module_.finishFadeIn();
        }
        if (this.savedModule_) {
          // Concurrent request to change to new module!
          this.transition_(new PrepareState(
              this.module_, this.savedMeta_, this.savedModule_,
              this.savedGlobals_, this.savedDeadline_));
        } else if (this.module_) {
          // Otherwise, display the module!
          this.transition_(new DisplayState(this.meta_, this.module_));
        } else {
          // No new module to display? Back to idle!
          this.transition_(new IdleState);
        }
      });
    }
    nextModule(meta, module, globals, deadline) {
      this.savedMeta_ = meta;
      this.savedModule_ = module;
      this.savedGlobals_ = globals;
      this.savedDeadline_ = deadline;
    }
  }

  // Displays a module until told to show a new one.
  class DisplayState extends stateMachine.State {
    constructor(meta, module) {
      super('DisplayState');

      this.meta_ = meta;
      this.module_ = module;
    }
    getTitleCard_() {
      var elem = document.querySelector('#title-card');
      if (!elem) {
        elem = document.createElement('div');
        elem.id = 'title-card';
        document.body.insertBefore(elem, document.body.firstChild);
      }
      return elem;
    }
    enter_() {
      // If we are at the config's title card, and the meta contains title
      // information, display that.
      if (info.showTitleCard) {
        // Ensure that the right element exists.
        var titleCardElement = this.getTitleCard_();

        // Type safety? What's that?
        if (typeof this.meta_.title === 'string') {
          titleCardElement.innerHTML = `<div>${this.meta_.title}</div>
              <div>${this.meta_.author}</div>`;
        } else {
          titleCardElement.innerHTML =
              `<img src="${asset(this.meta_.title.path)}">`;
        }
      }
    }
    nextModule(meta, module, globals, deadline) {
      this.transition_(
          new PrepareState(this.module_, meta, module, globals, deadline));
    }
  }

  return ClientStateMachine;
});
