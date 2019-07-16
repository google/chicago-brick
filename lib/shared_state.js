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

// TODO(applmak): This is only used by the client. Move this there.
// An interpolator knows how to retrieve data from a sharedstate's store.
// It's a function (with a well-defined .name!) that takes two {time,value}
// tuples and returns the appropriate data for a time.

// Shared State is a class that the server can use to share state with the
// clients.
export class SharedState {
  constructor(name, interpolator, size) {
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
  earliest() {
    return this.store_[0];
  }
  latest() {
    if (this.hasData()) {
      return this.store_[this.store_.length - 1];
    }
    return null;
  }
  hasData() {
    return !!this.store_.length;
  }
  *pairs() {
    for (let i =0; i < this.store_.length-1; i++) {
      yield [this.store_[i], this.store_[i+1]];
    }
  }
  // Returns the value of the shared state, according to the specific kind of
  // variable & interpolator.
  get(t) {
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
    if (t <= this.earliest().time) {
      return this.earliest().value;
    }
    // Too late!
    if (t >= this.latest().time) {
      return this.latest().value;
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
  set(value, time) {
    this.store_.push({
      time: time,
      value: value
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
export function NumberLerpInterpolator(time, at, av, bt, bv) {
  if (av === null || bv === null) {
    return null;
  }
  return av + (bv - av)/(bt - at)*(time - at);
}

// Jumps to the next value halfway through the allotted time interval.
export function ValueNearestInterpolator(time, at, av, bt, bv) {
  if (Math.abs(time - at) < Math.abs(time - bt)) {
    return av;
  } else {
    return bv;
  }
}

// This interpolator doesn't interpolate, it just returns value A, meaning the
// value that's still current.
export function CurrentValueInterpolator(time, at, av, bt, bv) {
  return time >= bt ? bv : av;
}

function ObjectInterpolatorGenerator(def) {
  var dynamicInterpolator = {};
  for (var k in def) {
    dynamicInterpolator[k] = decodeInterpolator(def[k]);
  }

  return function ObjectInterpolator(time, at, av, bt, bv) {
    av = av || {};
    bv = bv || {};
    return Object.keys(def).reduce((ret, k) => {
      const interpolator = dynamicInterpolator[k] || dynamicInterpolator['*'];
      if (interpolator) {
        ret[k] = interpolator(time, at, av[k], bt, bv[k]);
      }
      return ret;
    }, {});
  };
}

function ArrayInterpolatorGenerator(def) {
  // Def is an array of 1 generator reference.
  var dynamicInterpolator = decodeInterpolator(def[0]);

  return function ArrayInterpolator(time, at, av, bt, bv) {
    av = av || [];
    bv = bv || [];
    return av.map((value, index) => {
      return dynamicInterpolator(time, at, av[index], bt, bv[index]);
    });
  };
}

export function decodeInterpolator(def) {
  if (typeof def === 'function') {
    return def;
  } else if (def instanceof Array || def[0] !== undefined) {
    // array interpolator!
    return ArrayInterpolatorGenerator(def);
  } else {
    // object interpolator!
    return ObjectInterpolatorGenerator(def);
  }
}
