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

/**
 * Returns an error recording function that wraps a debugger
 * provided by the standard debug module.
 * Recorded errors are sent to the server.
 */
define(function(require) {
  'use strict';

  var network = require('client/network/network');

  return {
    error: function(debug) {
      return function(e) {
        debug(e);
        network.send('record-error', {
          message: e.message || e,
          stack: e.stack,
          namespace: debug.namespace,
        });
      };
    },
  };
});
