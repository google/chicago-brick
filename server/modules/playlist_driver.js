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

let timer;

const driveStateMachine = (playlist, layoutSM, clearTimer) => {
  // TODO(jgessner): Make this a proper class with an owner and a cleaner reset API
  // instead of a hacky globals thing.
  if (clearTimer) {
    clearTimeout(timer);
  }

  const nextLayout = layoutIndex => {
    // Show this layout next:
    let layout = playlist[layoutIndex];
    let partition = wallGeometry.partitionGeo(layout.maxPartitions);

    // The time that we'll switch to a new layout.
    let newLayoutTime = time.inFuture(layout.duration * 1000);

    if (monitor.isEnabled()) {
      monitor.update({playlist: {
        time: time.now(),
        event: `change layout`,
        deadline: newLayoutTime
      }});
    }

    layoutSM.setPartition(partition).then(() => {
      // Shuffle the module list for each partition:
      let modulesPerPartition = partition.map(() => {
        let modules = Array.from(layout.modules);
        random.shuffle(modules);
        return modules;
      });

      const nextModule = moduleIndex => {
        layoutSM.setErrorListener(error => {
          // Stop normal advancement.
          clearTimeout(timer);
          nextModule((moduleIndex + 1) % modulesPerPartition[0].length);
        });

        // The time that we'll switch to the next module.
        let newModuleTime = time.inFuture(layout.moduleDuration * 1000);

        // Tell each partition to play the next module in the list.
        modulesPerPartition.forEach((modules, index) => {
          layoutSM.playModule(index, modules[moduleIndex]);
        });

        if (monitor.isEnabled()) {
          monitor.update({playlist: {
            time: time.now(),
            event: `change module`,
            deadline: Math.min(newModuleTime, newLayoutTime)
          }});
        }

        // Now, in so many seconds, we'll need to switch to another module or another layout. How much time do we
        // have?
        timer = (newLayoutTime < newModuleTime) ?
          setTimeout(() => nextLayout((layoutIndex + 1) % playlist.length), time.until(newLayoutTime)) :
          setTimeout(() => nextModule((moduleIndex + 1) % modulesPerPartition[0].length), time.until(newModuleTime));
      };

      Promise.all(layout.modules.map(m => m.whenLoadedPromise)).then(() => nextModule(0));
    });
  };
  nextLayout(0);
};

module.exports = {
  driveStateMachine
};
