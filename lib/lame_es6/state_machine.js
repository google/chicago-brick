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

/**
 * A state interface. All states must inherit from this interface.
 */
export class State {
  /**
   * Return the name of this state.
   */
  getName() { return this.constructor.name; }

  /**
   * Called by the machine when we transition to this state.
   */
  enter(transition, context) {}

  /**
   * Called by the machine when we transition away from this state.
   */
  exit() {}
}

/**
 * A state machine.
 */
export class StateMachine {
  constructor(initialState, debug = undefined) {
    // Remember the initial state. We'll return to it when an error occurs.
    this.initialState_ = initialState;

    // We don't transition to the initial state; we are simply in that state
    // to begin with.
    this.state = initialState;
    this.debug_ = debug;
    this.nextExternalState_ = null;

    /**
     * Resolver for the transition promise.
     */
    this.resolver_ = undefined;

    /**
     * Promise that, when resolved, indicates that we should transition to
     * the returned state.
     */
    this.transitionPromise_ = new Promise(resolve => {
      this.resolver_ = resolve;
    });

    /**
     * A context object shared by all states in this machine.
     */
    this.context_ = undefined;

    /**
     * An error listener, which is invoked when an error occurs.
     * The default one just swallows all errors.
     */
    this.errorListener_ = error => {};

    this.driveMachine();
    this.state.enter(this.resolver_, this.context_);
  }

  /**
   * Transitions the machine to a new state. To avoid infinite loops, multiple
   * calls to transitionTo on the same tick have no effect. Furthermore, we
   * throw if we attempt to transition to the same state.
   */
  transitionTo(newState) {
    if (this.state === newState) {
      throw new Error('Cannot transition from a state to itself.');
    }

    // There's a small chance that on the same tick that this is called, the
    // current state has already resolved the promise with a request to go to
    // some other state. If we allow this, the external event might be lost,
    // indicating that something has gone truly wrong. In order to ensure
    // that this can't happen, we queue up a single external event in a
    // separate variable, and always prefer it over any internal event to the
    // same state. This can means that the author of the States in the State
    // Machine can't always be assured that an internal transition will occur,
    // and must guard against any transition happening at any time. But this
    // is really no different than the work an implementor has to do.

    if (this.nextExternalState_) {
      throw new Error('There already IS a next state');
    }
    if (this.debug_) {
      this.debug_(`External transition to ${newState.getName()} requested.`);
    }

    this.nextExternalState_ = newState;
    this.resolver_(newState);
  }

  /**
   * Sets the shared context object to the passed-in value.
   */
  setContext(context) {
    this.context_ = context;
  }

  /**
   * Sets the error listener to the passed-in handler.
   */
  setErrorListener(handler) {
    this.errorListener_ = handler;
  }

  /**
   * Returns a promise that's resolved when the current transition finishes. If
   * there is no current transitions, it will resolve when the next transition
   * requested completes.
   */
  getTransitionPromise() {
    return new Promise((resolve, reject) => {
      this.transitionPromise_.then(resolve, reject);
    });
  }

  /**
   * Waits for a transition to be requested, then performs the transition,
   * finally waiting again.
   */
  driveMachine() {
    this.transitionPromise_.then(newState => {
      // Tell old state to go away (synchronously).
      this.state.exit();
      if (this.nextExternalState_) {
        // External transitions always win.
        newState = this.nextExternalState_;
        this.nextExternalState_ = null;
      }

      if (this.debug_) {
        this.debug_(`Transitioning from ${this.state.getName()} to ${newState.getName()}.`);
      }

      // Adopt the new state, now that cleanup is complete.
      this.state = newState;
      // Now, we need to enter the new state, and the state may choose to
      // move to some other state automatically (over time), but some other
      // force may drive the state machine to a new state!

      // First, we need to make a new resolver, indicating that we now allow
      // outside users to drive the state machine again via transitionTo().
      let resolver;
      let promise = new Promise(r => resolver = r);

      // Now, we can enter the new state, and let this client code do whatever
      // it wants. It can immediately call the resolver in this function, in
      // which case, on the next tick, we'll transition to that state. In the
      // event that an external event occurs on the same tick as one of these
      // immediate-resolves, the external transition will win.
      this.state.enter(s => {
        if (this.debug_) {
          this.debug_(`Internal transition to ${s.getName()} requested.`);
        }
        resolver(s);
      }, this.context_);

      // Now, we promote the resolver and the promise to the public API.
      this.resolver_ = resolver;
      this.transitionPromise_ = promise;

      // Restart the machine.
      this.driveMachine();
    }).catch(error => {
      if (this.debug_) {
        this.debug_(error.stack);
      }
      // Whoa! Some kind of exception occurred while we were attempting to do
      // a transition. Delegate to the error handler. The error handler is
      // responsible for resuming the state machine.
      if (this.errorListener_) {
        this.errorListener_(error);
      }

      // Go back to the initial state.
      this.transitionTo(this.initialState_);

      // Restart the engine.
      this.driveMachine();
    });
  }
}
