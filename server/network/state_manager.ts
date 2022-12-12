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

import { wss } from "./network.ts";

export interface StateEntry {
  time: number;
  data: unknown;
}
export type PerModuleState = Record<string, StateEntry>;

// A map of module id -> {state name -> {time, data}};
const stateMap: Record<string, PerModuleState> = {};

export interface ModuleState {
  store(stateName: string, time: number, data: unknown): void;
}

/** Returns a state-capturing object bound to a specific module id. */
export function forModule(id: string) {
  // Return a module-appropriate facade that can be used to fill out the state
  // map.
  return {
    open(): ModuleState {
      stateMap[id] = {};
      return {
        store(stateName: string, time: number, data: unknown) {
          // Store this state only, forgetting about the rest of them.
          stateMap[id][stateName] = { time, data };
        },
      };
    },
    close() {
      delete stateMap[id];
      wss.send("state-closed", id);
    },
  };
}

let justSentAnEmptyState = false;
/** Sends the saved state to clients. */
export function send() {
  const stateToSend = Object.entries(stateMap).reduce(
    (agg, [moduleId, state]) => {
      if (Object.keys(state).length) {
        agg[moduleId] = state;
      }
      return agg;
    },
    {} as typeof stateMap,
  );
  if (Object.keys(stateToSend).length == 0) {
    if (justSentAnEmptyState) {
      return;
    }
    justSentAnEmptyState = true;
  } else {
    justSentAnEmptyState = false;
  }

  wss.send("state", stateToSend);
}

export function getStateKeys(): string[] {
  return Object.keys(stateMap).reduce((agg, o) => {
    return agg.concat(
      Object.keys(stateMap[o]).map((s) => {
        return `${o}: ${s}`;
      }),
    );
  }, [] as string[]);
}
