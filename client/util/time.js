/* Copyright 2015 Google Inc. All Rights Reserved.

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

define(function(require) {
  'use strict';
  var clockSkew = require('clock-skew')({});

  var network = require('client/network/network');

  var timeRequester = null;
  
  return {
    start: function() {
      network.on('time', clockSkew.adjustTimeByReference);
      network.send('time');
      timeRequester = setInterval(function() { network.send('time'); }, 10000);
    },
    stop: function() {
      network.removeListener('time', clockSkew.adjustTimeByReference);
      clearInterval(timeRequester);
      timeRequester = null;
    },
    now: function() {
      return clockSkew.getTime();
    },
    until: function(serverDeadline) {
      return Math.max(0, serverDeadline - clockSkew.getTime());
    }
  };
});
