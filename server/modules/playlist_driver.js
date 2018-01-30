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

'use strict';

const monitor = require('server/monitoring/monitor');
const random = require('random-js')();
const time = require('server/util/time');
const wallGeometry = require('server/util/wall_geometry');
const debug = require('debug')('wall::playlist_driver');

const makeDriver = layoutSM => {
  let timer = 0;
  let savedPlaylist = null;
  // Timestamp of next transition.
  let nextTransition = Infinity;
  return {
    getNextDeadline() {
      return nextTransition;
    },
    getPlaylist() {
      return savedPlaylist;
    },
    driveStateMachine(playlist) {
      savedPlaylist = playlist;
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }

      const nextLayout = layoutIndex => {
        // Show this layout next:
        let layout = playlist[layoutIndex];

        // The time that we'll switch to a new layout.
        let newLayoutTime = time.inFuture(layout.duration * 1000);

        if (monitor.isEnabled()) {
          monitor.update({playlist: {
            time: time.now(),
            event: `change layout`,
            deadline: newLayoutTime
          }});
        }

        debug(`Next Layout: ${layoutIndex}`);

        layoutSM.fadeOut().then(() => {
          // Shuffle the module list:
          let modules = Array.from(layout.modules);
          random.shuffle(modules);
      
          const nextModule = moduleIndex => {
            layoutSM.setErrorListener(error => {
              // Stop normal advancement.
              clearTimeout(timer);
              nextModule((moduleIndex + 1) % modules.length);
            });

            // The time that we'll switch to the next module.
            let newModuleTime = time.inFuture(layout.moduleDuration * 1000);

            // Tell the layout to play the next module in the list.
            layoutSM.playModule(modules[moduleIndex]);

            if (monitor.isEnabled()) {
              monitor.update({playlist: {
                time: time.now(),
                event: `change module`,
                deadline: Math.min(newModuleTime, newLayoutTime)
              }});
            }

            // Now, in so many seconds, we'll need to switch to another module 
            // or another layout. How much time do we have?
            if (newLayoutTime < newModuleTime) {
              timer = setTimeout(() => nextLayout((layoutIndex + 1) % playlist.length), time.until(newLayoutTime));
              nextTransition = newLayoutTime;
            } else {
              timer = setTimeout(() => nextModule((moduleIndex + 1) % modules.length), time.until(newModuleTime));
              nextTransition = newModuleTime;
            }
          };

          Promise.all(layout.modules.map(m => m.whenLoadedPromise)).then(() => nextModule(0));
        });
      };
      nextLayout(0);
    }
  };
}

module.exports = {
  makeDriver
};
