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
import { assert } from "../../lib/assert.ts";
import { PerModuleState } from "../../server/network/state_manager.ts";
import * as network from "./network.ts";

interface StateDataPoint {
  time: number;
  value: unknown;
}

type Interpolator<T> = (
  t: number,
  a: number,
  av: T,
  b: number,
  bv: T,
) => T;

// An interpolator knows how to retrieve data from a sharedstate's store.
// It's a function (with a well-defined .name!) that takes two {time,value}
// tuples and returns the appropriate data for a time.

// Shared State is a class that the server can use to share state with the
// clients.
export class SharedState {
  readonly name_: string;
  readonly store_: StateDataPoint[];
  readonly maxSize_: number;
  readonly interpolator_: Interpolator<unknown>;

  constructor(
    name: string,
    interpolator: Interpolator<unknown>,
    size: number,
  ) {
    // For debugging purposes only.
    this.name_ = name;

    // A store of timestamp, value tuples. We store no more than the last `size`
    // samples of the state. On both the client and the server, the times are in
    // server-time.
    this.store_ = [];

    this.maxSize_ = size;

    // Strategy pattern: Defines a way to access the state.
    this.interpolator_ = interpolator;
  }
  earliest(): StateDataPoint | undefined {
    return this.store_[0];
  }
  latest(): StateDataPoint | null {
    if (this.hasData()) {
      return this.store_[this.store_.length - 1];
    }
    return null;
  }
  hasData(): boolean {
    return !!this.store_.length;
  }
  *pairs(): Iterable<[StateDataPoint, StateDataPoint]> {
    for (let i = 0; i < this.store_.length - 1; i++) {
      yield [this.store_[i], this.store_[i + 1]];
    }
  }
  // Returns the value of the shared state, according to the specific kind of
  // variable & interpolator.
  get(t: number): unknown | null {
    // Subtract 200 ms, because in typical operation, the reader (the client) is
    // going to always be ahead of the writer (the server) by 1-2 server ticks
    // which is 100ms.
    const CLIENT_STATE_LAG_TICKS = 2; // LOL
    const SERVER_MS_PER_TICK = 100;
    t -= CLIENT_STATE_LAG_TICKS * SERVER_MS_PER_TICK;
    // Edge cases: No data!
    if (!this.hasData()) {
      return null;
    }
    // Too early!
    if (t <= this.earliest()!.time) {
      return this.earliest()!.value;
    }
    // Too late!
    if (t >= this.latest()!.time) {
      return this.latest()!.value;
    }

    for (const [a, b] of this.pairs()) {
      if (a.time <= t && t < b.time) {
        return this.interpolator_(t, a.time, a.value, b.time, b.value);
      }
    }

    // Huh?
    return null;
  }
  // Sets the current value of the state.
  set(value: unknown, time: number) {
    this.store_.push({
      time: time,
      value: value,
    });

    // Ensure there are no more than 25 entries.
    while (this.store_.length > this.maxSize_) {
      this.store_.shift();
    }
  }
}

// The lerp interpolator walks the store, looking for a time value between
// the start and end. If it finds one, we lerp between the values. If not, we
// use the start or end, appropriately.
export function NumberLerpInterpolator(
  time: number,
  at: number,
  av: number | null,
  bt: number,
  bv: number | null,
): number | null {
  if (av === null || bv === null) {
    return null;
  }
  return av + (bv - av) / (bt - at) * (time - at);
}

// Jumps to the next value halfway through the allotted time interval.
export function ValueNearestInterpolator(
  time: number,
  at: number,
  av: unknown,
  bt: number,
  bv: unknown,
): unknown {
  if (Math.abs(time - at) < Math.abs(time - bt)) {
    return av;
  } else {
    return bv;
  }
}

// This interpolator doesn't interpolate, it just returns value A, meaning the
// value that's still current.
export function CurrentValueInterpolator(
  time: number,
  _at: number,
  av: unknown,
  bt: number,
  bv: unknown,
) {
  return time >= bt ? bv : av;
}

function ObjectInterpolatorGenerator(
  def: Record<string, unknown>,
): Interpolator<Record<string, unknown>> {
  const dynamicInterpolator: Record<string, Interpolator<unknown>> = {};
  for (const k in def) {
    dynamicInterpolator[k] = decodeInterpolator(def[k]);
  }

  return function ObjectInterpolator(
    time: number,
    at: number,
    av: Record<string, unknown>,
    bt: number,
    bv: Record<string, unknown>,
  ): Record<string, unknown> {
    av = av || {};
    bv = bv || {};
    // If the def has only the special key '*', then we use whatever keys
    // are on the value, rather than the definition.
    let keys = Object.keys(def);
    if (keys.length == 1 && keys[0] == "*") {
      keys = Object.keys(av);
    }
    return keys.reduce((ret, k) => {
      const interpolator = dynamicInterpolator[k] || dynamicInterpolator["*"];
      if (interpolator) {
        ret[k] = interpolator(time, at, av[k], bt, bv[k]);
      }
      return ret;
    }, {} as Record<string, unknown>);
  };
}

function ArrayInterpolatorGenerator(def: [unknown]): Interpolator<unknown[]> {
  // Def is an array of 1 generator reference.
  const dynamicInterpolator = decodeInterpolator(def[0]);

  return function ArrayInterpolator(
    time: number,
    at: number,
    av: unknown[],
    bt: number,
    bv: unknown[],
  ): unknown[] {
    av = av || [];
    bv = bv || [];
    return av.map((_value: unknown, index: number) => {
      return dynamicInterpolator(time, at, av[index], bt, bv[index]);
    });
  };
}

export function decodeInterpolator(
  def: unknown,
): Interpolator<unknown> {
  if (typeof def === "function") {
    return def as Interpolator<unknown>;
  } else if (def instanceof Array && def[0] !== undefined) {
    // array interpolator!
    return ArrayInterpolatorGenerator(def as [unknown]) as Interpolator<
      unknown
    >;
  } else {
    // object interpolator!
    return ObjectInterpolatorGenerator(
      def as Record<string, unknown>,
    ) as Interpolator<
      unknown
    >;
  }
}

class StateRecord {
  readonly state: Record<string, SharedState> = {};
  readonly priorData: Record<string, Array<{ time: number; data: unknown }>> =
    {};
  clientClosedTime = Infinity;
  serverClosedTime = Infinity;
  lastUpdatedTime = time.now();
}

function isClosedOrStale(state: StateRecord) {
  const now = time.now();
  return (state.clientClosedTime < now - 5000) ||
    (state.serverClosedTime < now - 5000) ||
    (state.lastUpdatedTime < now - 600000); // 10 minutes.
}

export interface ModuleState {
  define(stateName: string, def: unknown, size?: number): SharedState;
  get(stateName: string): SharedState;
}

// A map of module id -> {
//   state: {state name -> SharedState},
//   clientClosedTime: timestamp,
//   serverClosedTime: timestamp,
// };
const stateMap: Record<string, StateRecord> = {};
export function forModule(id: string) {
  return {
    open() {
      // Before we add another state, reap old ones.
      for (const id in stateMap) {
        // If the client closed this more than 5 seconds ago,
        if (isClosedOrStale(stateMap[id])) {
          delete stateMap[id];
        }
      }

      if (!stateMap[id]) {
        stateMap[id] = new StateRecord();
      }
      return {
        define(stateName: string, def: unknown, size = 25) {
          assert(
            !(stateName in stateMap[id].state),
            `State ${stateName} was already defined!`,
          );
          stateMap[id].state[stateName] = new SharedState(
            stateName,
            decodeInterpolator(def),
            size,
          );
          if (stateMap[id].priorData[stateName]) {
            // We have some data that the server sent before we were ready.
            // Add it to the shared state now.
            for (const { data, time } of stateMap[id].priorData[stateName]) {
              // TODO(applmak): Warn if this overwrites data.
              stateMap[id].state[stateName].set(data, time);
            }
            delete stateMap[id].priorData[stateName];
          }
          return stateMap[id].state[stateName];
        },
        get(stateName: string) {
          return stateMap[id].state[stateName];
        },
      };
    },
    close() {
      if (stateMap[id]) {
        stateMap[id].clientClosedTime = time.now();
      }
    },
  };
}

export function init() {
  network.socket.on("state", (stateFromServer) => {
    for (const id in stateFromServer) {
      if (stateMap[id] && isClosedOrStale(stateMap[id])) {
        // If this state is closed or stale, we need to re-open it!
        delete stateMap[id];
      }
      if (!stateMap[id]) {
        stateMap[id] = new StateRecord();
      }
      let mostRecentTime = 0;
      for (const name in stateFromServer[id]) {
        mostRecentTime = Math.max(
          mostRecentTime,
          stateFromServer[id][name].time,
        );
        if (stateMap[id].state[name]) {
          // The client has already created this state.
          const { data, time } = stateFromServer[id][name];
          stateMap[id].state[name].set(data, time);
        } else {
          // The client hasn't registered for this state yet...
          // We'll hang onto it anyway.
          stateMap[id].priorData[name] = stateMap[id].priorData[name] || [];
          stateMap[id].priorData[name].push(stateFromServer[id][name]);
          while (stateMap[id].priorData[name].length > 25) {
            stateMap[id].priorData[name].shift();
          }
        }
      }
      stateMap[id].lastUpdatedTime = Math.max(mostRecentTime, time.now());
    }
  });
  network.socket.on("state-closed", (id) => {
    if (stateMap[id]) {
      stateMap[id].serverClosedTime = time.now();
    }
  });
}

declare global {
  interface EmittedEvents {
    state(map: Record<string, PerModuleState>): void;
    "state-closed": (id: string) => void;
  }
}
