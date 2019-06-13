/* Copyright 2019 Google Inc. All Rights Reserved.

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

import {delay, delayThenReject} from './promise.js';

export function configure({makeEmptyModule, monitor, debug, time, logError}) {
  function logIfError(fn, data) {
    try {
      fn();
    } catch (e) {
      logError(e, data);
    }
  }

  return class ModulePlayer {
    static makeEmptyModule() {
      return makeEmptyModule();
    }
    constructor() {
      // start with some kind of initial, off module.
      this.oldModule = ModulePlayer.makeEmptyModule();
      // When next module is non-null, it means that we've got a request come in
      // to play a new module.
      this.nextModule = null;
      // When true, we are actively trying to transition to a new module (i.e,
      // goToModule is in-progress).
      this.transitionInProgress = false;
    }

    // Behavior we want:
    // - No more than one goToModule operation is happening at a time.
    // - If playModule is called only once, goToModule completes.
    // - If playModule is called while goToModule is happening, goToModule aborts
    //   early at known interruption points, and we go to the new module.
    // - If playModule is called more than once while goToModule is happening,
    //   only the most recent becomes the nextModule.
    // You only need to wait for playModule if you want to be sure that the
    // player has tried to transition to your module, which is perfect for
    // tests.
    async playModule(module) {
      this.nextModule = module;
      if (monitor.isEnabled()) {
        monitor.update({
          event: `playModule: ${module.name}`,
          time: time.now(),
          deadline: module.deadline
        });
      }
      await this.performTransitions();
    }

    async performTransitions() {
      if (this.transitionInProgress) {
        return; // We'll do this work on the next iteration of the loop below.
      }
      this.transitionInProgress = true;
      while (this.oldModule != this.nextModule) {
        // Our local copy of the module we are trying to go to.
        const module = this.nextModule;
        await this.goToModule(this.nextModule);
        // Maybe we succeeded in going to module... maybe we didn't. It isn't
        // clear. If we failed to go to the module, then we should stop trying
        // to do so, but only if we haven't been told to go somewhere else.
        const failedToTransition = module != this.oldModule;
        const stillTryingToGetThere = module == this.nextModule;
        if (failedToTransition && stillTryingToGetThere) {
          // Just stop the loop, then.
          this.nextModule = this.oldModule;
        }
      }
      this.transitionInProgress = false;
    }
    /**
     * Goes to a specified module using a transition. This will take some time to
     * happen. We aren't exactly how much time it will take, but we know that
     * we'll endeavor to begin the visible transition by the module's deadline.
     *
     * This method can throw if something went wrong in preparing the module for
     * display. This method also returns false to indicate that we should skip
     * the usual delay until the next module and switch asap. Once a transition
     * starts, there's no way to interrupt it, so we change to the next module
     * as soon as we can.
     */
    async goToModule(module) {
      // Instantiate the module. If this throws, by contract, we have no cleanup
      // to do, so allow the exception to bubble up to the error logger and await
      // being told which module to go to next.
      try {
        debug(`Instantiating module ${module.name}.`);
        await Promise.race([module.instantiate(), delayThenReject(5000)]);
      } catch (e) {
        // If this throws, it's because of the delayed rejection.
        logError(new Error(`Module ${module.name} timed out in instantiation.`), {
          module: module.name,
          timestamp: time.now(),
          timestampSinceModuleStart: time.now() - module.deadline,
        });
        module.dispose();
        return;
      }
      // Instantiation is complete. If while we were doing that, we were told to
      // go to a new module, abort!
      if (this.nextModule != module) {
        // Clean up the just-instantiated module, and await further instructions.
        debug(`Switching to ${this.nextModule.name} after prior instantiation.`);
        module.dispose();
        return;
      }
      // Now tell the module to prepare to be shown. If this throws, by contract,
      // there's nothing we need to cleanup (the module self-disposes), as it's
      // unable to be used for anything anyway. Let that exception bubble up and
      // await further instructions. This will always wait until the module
      // deadline passed.
      if (monitor.isEnabled()) {
        monitor.update({
          state: `Preparing ${module.name}`,
          time: time.now(),
          deadline: module.deadline
        });
      }
      debug(`Preparing ${module.name}.`);
      try {
        await Promise.race([module.willBeShownSoon(), delayThenReject(5000)]);
      } catch (e) {
        // If this throws, it's because the delayed rejection.
        debug(e);
        logError(new Error(`Module ${module.name} timed out in preparation.`), {
          module: module.name,
          timestamp: time.now(),
          timestampSinceModuleStart: time.now() - module.deadline,
        });
        module.dispose();
        return;
      }
      // While we were getting all of that together, which might have taken a bit
      // of time, we should check to make sure that we are still trying to be
      // shown.
      if (this.nextModule != module) {
        // Clean up the module and await further instructions.
        debug(`Switching to ${this.nextModule.name} after prior preparation.`);
        module.dispose();
        return;
      }
      // Wait until the deadline when we are supposed to being the transition.
      debug(`Delaying until ${module.deadline} (≈${time.until(module.deadline)} from now)`);
      await delay(time.until(module.deadline));
      if (this.nextModule != module) {
        // Clean up the module and await further instructions.
        debug(`Switching to ${this.nextModule.name} after delay post-preparation.`);
        module.dispose();
        return;
      }
      // POINT OF NO RETURN FOR THE TRANSITION: IT BEGINS HERE.
      // Now let both the newmodule and the old module know that we are going to
      // perform the transition. If the old module throws, no one cares, we catch
      // and keep going. If the new module throws, that's bad, but we can't really
      // stop what we are doing at this point because we already promised the old
      // module we were going to transition. Instead, we transition to the empty
      // module, which is totally fine with being told to do stuff.
      const transitionFinishDeadline = module.deadline + 5000;
      if (monitor.isEnabled()) {
        monitor.update({
          state: `Transition ${this.oldModule.name} -> ${module.name}`,
          time: time.now(),
          deadline: transitionFinishDeadline
        });
      }
      debug(`Beginning transition to ${module.name}.`);
      logIfError(() => this.oldModule.beginTransitionOut(transitionFinishDeadline), {
        module: this.oldModule.name,
      });
      try {
        module.beginTransitionIn(transitionFinishDeadline);
      } catch (e) {
        logError(e, {
          module: module.name,
          timestamp: time.now(),
          timestampSinceModuleStart: time.now() - module.deadline,
        });
        debug(`Error forcing fade to black.`);
        // Now try to go to the empty module!
        this.nextModule = module = ModulePlayer.makeEmptyModule();
        module.instantiate();
      }
      // Perform the transition itself, which could take some time. The transition
      // is uninterruptible so no need to worry about changing what we are going
      // to in the middle of it.
      await module.performTransition(this.oldModule, transitionFinishDeadline);
      // Hey, we're done with the transition! Tell the old module this. If it
      // throws, who cares? We're about to dispose of it anyway.
      debug(`Finishing transition to ${module.name}.`);
      logIfError(() => this.oldModule.finishTransitionOut(), {
        module: this.oldModule.name,
      });
      try {
        module.finishTransitionIn();
      } catch (e) {
        logError(e, {
          module: module.name,
          timestamp: time.now(),
          timestampSinceModuleStart: time.now() - module.deadline,
        });
      } finally {
        // If finish fade in throws an exception, that's bad, and should cause us
        // to immediately skip to the next module. However, before we do that, we
        // need to dispose of our old module and update it to the new one that is
        // showing.
        this.oldModule.dispose();
        // We are definitely showing the new module now.
        this.oldModule = module;
      }
      if (monitor.isEnabled()) {
        monitor.update({
          state: `Display: ${this.oldModule.name}`,
          time: time.now()
        });
      }
      // FIN. Note that if the next module changed during our transition, then the
      // next iteration through our loop will cause that module to be displayed.
    }
  }
}
