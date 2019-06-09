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

import * as monitor from '../monitoring/monitor.js';
import Debug from 'debug';
import randomjs from 'random-js';
import assert from '../../lib/assert.js';
import {now, inFuture, until} from '../util/time.js';
import {RunningModule, tellClientToPlay} from './module.js';
import library from './module_library.js';
import {emitter} from '../network/clients.js';

const debug = Debug('wall::playlist_driver');
const random = new randomjs.Random();

export class PlaylistDriver {
  constructor(modulePlayer) {
    // The module player.
    this.modulePlayer = modulePlayer;
    // If non-zero, a handle to the current timer, which when fired, will tell
    // the wall to play a new module.
    this.timer = 0;
    // The current playlist (array of layouts).
    this.playlist = null;
    // The current order that we play the modules in.
    this.modules = [];
    // Index of the current layout in the playlist.
    this.layoutIndex = 0;
    // Index of current module in the modules array.
    this.moduleIndex = 0;
    // Timestamp of next layout change.
    this.newLayoutTime = Infinity;
    // Timestamp of next module change.
    this.newModuleTime = Infinity;

    emitter.on('new-client', client => {
      if (this.modules[this.moduleIndex]) {
        tellClientToPlay(client, this.modules[this.moduleIndex], 0);
      }
    });
  }
  // Returns the timestamp of the next module change.
  getNextDeadline() {
    return Math.min(this.newLayoutTime, this.newModuleTime);
  }
  // Returns the current playlist.
  getPlaylist() {
    return this.playlist;
  }
  // Returns a string indicating the type of transition we will perform next.
  getNextTransitionType() {
    if (this.newLayoutTime < this.newModuleTime) {
      return 'NextLayout';
    } else {
      return 'NextModule';
    }
  }
  // Resets any active timer so that any pending transition is cancelled.
  resetTimer_() {
    clearTimeout(this.timer);
    this.timer = 0;
  }
  // Starts a new playlist. This performs a layout transition, fading to black
  // if required.
  start(newPlaylist) {
    this.playlist = newPlaylist;
    this.resetTimer_();

    // Reset layout index.
    this.layoutIndex = -1;

    this.nextLayout();
  }
  // Immediately advanced to the next module in the current layout.
  // If there is only one module in a layout, restarts that module.
  skipAhead() {
    assert(this.playlist, 'Cannot advance without a playlist.');
    // This skips to the next module in the current layout.
    // We need to cancel any existing timer, because we are disrupting the
    // normal timing.
    this.resetTimer_();

    // Now, force the next module to play.
    this.nextModule();
  }
  // Plays a module by name, regardless of whether or not the module is
  // actually in the current playlist.
  // NOTE: This module will play for the moduleDuration of the current layout.
  playModule(moduleName) {
    // Force a specific module to play. Now, this particular module doesn't
    // necessarily exist in any kind of playlist, which presents us with a
    // choice as to how long to play this module. We'll choose to play it for
    // as long as the current layout says to play modules.
    let layout = this.playlist[this.layoutIndex];

    // Stop any existing timer so we don't transition early.
    // TODO(applmak): Consider making the timer management more foolproof by
    // having the next* or play* methods stop the timer.
    this.resetTimer_();

    // Reset duration for this module.
    this.newModuleTime = inFuture(layout.moduleDuration * 1000);
    // Ensure that we won't change layouts until this module is done.
    this.newLayoutTime = Math.max(this.newModuleTime, this.newLayoutTime);
    // Now play this module.
    this.playModule_(moduleName);
  }
  // Advances to the next layout in the playlist, fading out between them.
  async nextLayout() {
    // Update layoutIndex.
    this.layoutIndex = (this.layoutIndex + 1) % this.playlist.length;

    // Show this layout next:
    let layout = this.playlist[this.layoutIndex];

    // Reset moduleIndex
    this.moduleIndex = -1;

    // The time that we'll switch to a new layout.
    this.newLayoutTime = inFuture(layout.duration * 1000);

    if (monitor.isEnabled()) {
      monitor.update({playlist: {
        time: now(),
        event: `change layout`,
        deadline: this.newLayoutTime
      }});
    }

    debug(`Next Layout: ${this.layoutIndex}`);

    // If the wall isn't already faded out, fade it out:
    let concurrentWork = [];
    if (this.modulePlayer.oldModule.name != '_empty') {
      // Give the wall 1 second to get ready to fade out.
      concurrentWork.push(this.modulePlayer.playModule(RunningModule.empty(now() + 1000)));
    }
    // Shuffle the module list:
    this.modules = Array.from(layout.modules);
    random.shuffle(this.modules);

    concurrentWork.push(...layout.modules.map(m => m.whenLoadedPromise));
    // Wait until all of the modules are loaded.
    await Promise.all(concurrentWork);
    this.nextModule();
  }
  // Advances to the next module in the current layout. If there is only 1
  // module in the current playlist, transitions to another copy of that
  // module.
  nextModule() {
    this.moduleIndex = (this.moduleIndex + 1) % this.modules.length;

    // The current layout.
    let layout = this.playlist[this.layoutIndex];

    // The time that we'll switch to the next module.
    this.newModuleTime = inFuture(layout.moduleDuration * 1000);

    this.playModule_(this.modules[this.moduleIndex]);
  }
  // Private helper function that does the work of going to a module by name
  // and scheduling the next module to play after a certain duration.
  playModule_(module) {
    // Play a module until the next transition.
    // Give the wall 5 seconds to prep the new module and inform the clients.
    this.modulePlayer.playModule(new RunningModule(library.modules[module], now() + 5000));

    if (monitor.isEnabled()) {
      monitor.update({playlist: {
        time: now(),
        event: `change module ${module}`,
        deadline: this.getNextDeadline(),
      }});
    }

    // Now, in so many seconds, we'll need to switch to another module
    // or another layout. How much time do we have?
    if (this.newLayoutTime < this.newModuleTime) {
      this.timer = setTimeout(() => this.nextLayout(), until(this.newLayoutTime));
    } else if (this.modules.length > 1 || this.modules.indexOf(module) == -1) {
      // Only schedule the next module to play if:
      // a) There are multiple modules in the current layout, or
      // b) The module we are now playing is not in the current layout, and so
      //    we wish to return to that layout.
      this.timer = setTimeout(() => this.nextModule(), until(this.newModuleTime));
    }
  }
}
