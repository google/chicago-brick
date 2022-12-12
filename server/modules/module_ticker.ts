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

import * as time from "../../lib/adjustable_time.ts";
import { easyLog } from "../../lib/log.ts";
const log = easyLog("wall:module_ticker");
import * as stateManager from "../network/state_manager.ts";
import type { RunningModule } from "./module.ts";

// An array of RunningModule objects.
let modulesToTick: RunningModule[] = [];

// Ticking loop.
let lastTime = 0;
const interval = 1000.0 / 10.0; // 10 FPS

function tick() {
  const startModuleTick = time.now();
  for (const module of modulesToTick) {
    try {
      module.tick(startModuleTick, startModuleTick - lastTime);
    } catch (e) {
      log.error(e);
    }
  }
  const startStateSend = time.now();
  if (modulesToTick.length) {
    stateManager.send();
  }
  lastTime = startModuleTick;

  // Set timeout for remaining tick time, or immediately if the module went
  // over.
  const endTick = time.now();
  const tickTime = endTick - startModuleTick;
  if (tickTime > interval) {
    if (endTick - startStateSend > 50) {
      log.warn(
        `State sending took too long: ${endTick - startStateSend} ms: ${
          stateManager.getStateKeys().join(" ")
        }`,
      );
    }
    log.warn(
      `Module tick() took too long: ${tickTime} ms out of ${interval} ms: ${
        modulesToTick.map((m) => m.name).join(", ")
      }`,
    );
  }
  setTimeout(tick, Math.max(interval - tickTime, 0));
}
tick();

/** Add a module to the list of modules to tick. */
export function add(module: RunningModule) {
  if (module.instance) {
    modulesToTick.push(module);
    log.debugAt(
      1,
      "Add: We are now ticking " + modulesToTick.length + " modules:",
      modulesToTick.map((m) => m.name).join(", "),
    );
    if (modulesToTick.length > 2) {
      log.error("Ticking more than 2 modules!");
    }
  }
}

/** Remove a module from the list of modules to tick. */
export function remove(module: RunningModule) {
  modulesToTick = modulesToTick.filter((m) => {
    if (m === module) {
      m.dispose();
      return false;
    }
    return true;
  });
  log.debugAt(
    1,
    "Remove: We are now ticking " + modulesToTick.length + " modules",
    modulesToTick.map((m) => m.name).join(", "),
  );
}
