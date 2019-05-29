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
 * A state machine for the server side of a module that loops through a schedule
 * of states.  Each element of the schedule has a duration and an ending state.
 *
 * This bridges the conceptual gap between how a module author wants to think
 * about a series of states, and the need to blast a new state out on every
 * tick so that clients are all in sync.
 *
 * @param {StateManager} stateManager The server's StateManager instance.
 * @param {Object} interpolatorDefinition An interpolator as defined by
 * SharedState.
 * @param {Array<{dur: number, state}>} schedule A list of durations (in
 * milliseconds) and ending states that the object will tick through.
 */
export class StateSchedule {
  constructor(stateManager, interpolatorDefinition, schedule) {
    /**
     * The SharedState instance that backs the machine.
     * @type {SharedState}
     */
    this.state_ = stateManager.createPrivate(interpolatorDefinition);

    /**
     * The schedule.  A list of {dur:number, state:object} records, where the
     * durations are in milliseconds and the state objects conform to the
     * interpolator definition.
     * @type {Array<{dur: number, state}>}
     */
    this.schedule_ = schedule;

    /**
     * Initialization can only complete on the first tick.
     * @type {bool}
     */
    this.firstTick_ = true;

    /**
     * The index of the next item in the schedule array.
     * @type {number}
     */
    this.nextItemIndex_ = 0;
  }

  /**
   * Gets the appropriate state from the schedule for the given time + delta.
   * That is, finds the state that will be correct one tick in the future.  To be
   * called from the server's tick() method, and the result passed to a state
   * instance that is shared with clients.
   *
   * @param {number} time The time parameter from the server's tick method.
   * @param {number} delta The delta parameter from the server's tick method.
   */
  tick(time, delta) {
    if (this.firstTick_) {
      this.firstTick_ = false;

      /**
       * The starting time of the next item in the schedule array.
       * @type {number}
       */
      this.nextItemTime_ = time;
    }

    var nextTick = time + delta;

    // If we're within one tick of the time that the previous schedule item will
    // start, add the next item to the state.
    while (this.nextItemIndex_ < this.schedule_.length &&
           this.nextItemTime_ <= nextTick) {
      var item = this.schedule_[this.nextItemIndex_++];
      this.nextItemTime_ += item.dur;
      this.state_.set(item.state, this.nextItemTime_);
    }

    // Loop back to the beginning once we reach the end.
    if (this.nextItemIndex_ >= this.schedule_.length) {
      this.nextItemIndex_ = 0;
    }

    return this.state_.get(nextTick);
  }
}
