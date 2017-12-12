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

// This is gobbledegook that we need to have a node-complaint module def in JS
// while at the same time supporting our requirejs loader in the browser.
// If we converted to ES6' modules, this would go away.
(function(factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['client/util/time'], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    var time = require('server/util/time');
    module.exports = factory(time);
  }
}(function(time) {
  // An interpolator knows how to retrieve data from a sharedstate's store.
  // It's a function (with a well-defined .name!) that takes two {time,value}
  // tuples and returns the appropriate data for a time.

  // Shared State is a class that the server can use to share state with the
  // clients.
  // TODO(pieps): Get rid of owner here - only ClientSharedState should care.
  var SharedState = function(name, interpolator, owner) {
    // For debugging purposes only.
    this.name_ = name;

    // A store of timestamp, value tuples. We store no more than the last 10
    // samples of the state. On both the client and the server, the times are in
    // server-time.
    this.store_ = [];

    // Strategy pattern: Defines a way to access the state.
    this.interpolator_ = interpolator;

    // Owner of the state: either a client socket id or 'server'.
    this.owner_ = owner;
  };

  // Returns the value of the shared state, according to the specific kind of
  // variable & interpolator.
  SharedState.prototype.get = function(opt_time) {
    var t = opt_time || time.now();

    // Edge cases: No data!
    if (this.store_.length === 0) {
      return null;
    }
    // Too early!
    if (t <= this.store_[0].time) {
      return this.store_[0].value;
    }
    // Too late!
    if (t >= this.store_[this.store_.length-1].time) {
      return this.store_[this.store_.length-1].value;
    }

    for (var i = 1; i < this.store_.length; i++) {
      var a = this.store_[i-1];
      var b = this.store_[i];
      if (a.time <= t && t <= b.time) {
        return this.interpolator_(t, a.time, a.value, b.time, b.value);
      }
    }

    // Huh?
    return null;
  };

  // Sets the current value of the state.
  SharedState.prototype.set = function(value, time) {
    this.store_.push({
      time: time,
      value: value
    });

    // Ensure there are no more than 10 entries.
    while (this.store_.length > 10) {
      this.store_.shift();
    }
  };

  // The lerp interpolator walks the store, looking for a time value between
  // the start and end. If it finds one, we lerp between the values. If not, we
  // use the start or end, appropriately.
  function NumberLerpInterpolator(time, at, av, bt, bv) {
    if (av === null || bv === null) {
      return null;
    }
    return av + (bv - av)/(bt - at)*(time - at);
  }

  // Jumps to the next value halfway through the allotted time interval.
  function ValueNearestInterpolator(time, at, av, bt, bv) {
    if (Math.abs(time - at) < Math.abs(time - bt)) {
      return av;
    } else {
      return bv;
    }
  }

  // This interpolator doesn't interpolate, it just returns value A, meaning the
  // value that's still current.
  function CurrentValueInterpolator(time, at, av, bt, bv) {
    return time >= bt ? bv : av;
  }

  function ObjectInterpolatorGenerator(def) {
    var dynamicInterpolator = {};
    for (var k in def) {
      dynamicInterpolator[k] = decodeInterpolator(def[k]);
    }

    return function ObjectInterpolator(time, at, av, bt, bv) {
      var ret = {};

      av = av || {};
      bv = bv || {};
      for (var k in av) {
        if (k in bv) {
          // interpolate
          var interpolator = dynamicInterpolator[k] || dynamicInterpolator['*'];
          if (!interpolator) {
            throw new Error('No interpolator for field: ' + k);
          }
          ret[k] = interpolator(time, at, av[k], bt, bv[k]);

        } else {
          ret[k] = av[k];
        }
      }

      for (k in bv) {
        if (!(k in av)) {
          ret[k] = bv[k];
        }
      }

      return ret;
    };
  }

  function ArrayInterpolatorGenerator(def) {
    // Def is an array of 1 generator reference.
    var dynamicInterpolator = decodeInterpolator(def[0]);

    return function ArrayInterpolator(time, at, av, bt, bv) {
      av = av || [];
      bv = bv || [];
      return av.map(function(value, index) {
        return dynamicInterpolator(time, at, av[index], bt, bv[index]);
      });
    };
  }

  var simpleInterpolators = [
    NumberLerpInterpolator,
    ValueNearestInterpolator,
    CurrentValueInterpolator
  ];

  function decodeInterpolator(def) {
    if (typeof def === 'string') {
      // simple interpolator!
      return simpleInterpolators.filter(function(i) {
        return i.name == def;
      })[0];
    } else if (def instanceof Array || def[0] !== undefined) {
      // array interpolator!
      return ArrayInterpolatorGenerator(def);
    } else {
      // object interpolator!
      return ObjectInterpolatorGenerator(def);
    }
  }

  return {
    SharedState: SharedState,
    addSimpleInterpolator: function(interpolator) {
      if (!interpolator.name) {
        throw new Error('Interpolators MUST have a .name');
      }
      simpleInterpolators.push(interpolator);
    },
    decodeInterpolator: decodeInterpolator
  };
}));
