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

// This is gobbledegook that we need to have a node-complaint module def in JS
// while at the same time supporting our requirejs loader in the browser.
// If we converted to ES6' modules, this would go away.
(function(factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['util/debug'], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    var debug = require('debug');
    module.exports = factory(debug);
  }
}(function(debug) {
  debug = debug('wall:state_machine');
  // A state machine implements a specific interface and has associated states
  // that also implement this interface. The state machine's impl forwards these
  // methods onto the current state which might cause a transition to a new
  // state. Transitions are effectively instantaneous, while a state might be
  // current for some time.
  var StateMachine = function(name, initialState) {
    // Just for logging purposes.
    this.name_ = name;

    this.current_ = new State('_initial');

    // A list of predicate(state), defer pairs. When we enter a state, we run
    // the predicates. If any return true, we resolve the defer & remove the
    // pair from the list.s
    this.predicates_ = [];

    // An arbitrary struct of stuff that is 'global' w.r.t this state machine
    // instance. Subclasses can set this, and this object will be shared with
    // every 'State' instance before 'enter' is called.
    this.context_ = {};

    // We _really_ start in the initial state.
    this.enterNewState_(initialState);
  };
  StateMachine.prototype.enterNewState_ = function(state) {
    if (state === this.current_) {
      // No work to do, as we're already in that state!
      debug(this.name_, 'Self-edge in state machine!', state.name_);
      return Promise.reject('self-edge');
    }

    debug(
        this.name_, 'transition from', this.current_.name_, 'to', state.name_);
    this.current_ = state;
    // Add context to this state.
    state.setContext(this.context_);
    try {
      state.enter_();
    } catch (e) {
      debug('While entering', state.name_);
      debug(e.message);
      debug(e.stack);
    }

    this.predicates_ = this.predicates_.filter(function(pair) {
      if (pair.predicate(state)) {
        pair.resolve();
        // Remove the pair.
        return false;
      }
      return true;
    });

    return state.transitionDefer_.promise
        .then(this.enterNewState_.bind(this))
        .catch(this.handleError_);
  };
  StateMachine.prototype.handleError_ = function(err) {
    debug('While transitioning', err);
  };
  StateMachine.prototype.monitorState = function(predicate) {
    var self = this;
    return new Promise(function(resolve) {
      self.predicates_.push({predicate: predicate, resolve: resolve});
    });
  };
  StateMachine.prototype.getState = function() {
    return this.current_.name_;
  };

  var State = function(name) {
    // The name of the state (for logging only).
    this.name_ = name;

    // The promise that, when resolved, transitions to a new state.
    this.transitionDefer_ = Promise.defer();

    // The shared context object set from the state machine before 'enter' is
    // called.
    this.context_ = {};
  };
  State.prototype.setContext = function(context) {
    this.context_ = context;
  };
  State.prototype.enter_ = function() {
    this.transitionDefer_.reject('You must implement enter.');
  };
  // Call this to transition to a new state.
  State.prototype.transition_ = function(state) {
    this.transitionDefer_.resolve(state);
  };

  return {Machine: StateMachine, State: State};
}));
