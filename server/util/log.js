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

import * as time from './time.js';
import EventEmitter from 'events';

export const recentErrors = [];
const ERROR_BUFFER_SIZE = 100;

function pushError(record) {
  recentErrors.push(record);
  emitter.emit('error', record);
  while (recentErrors.length > ERROR_BUFFER_SIZE) {
    recentErrors.shift();
  }
}

/**
 * Returns an error recording function that wraps a debugger
 * provided by the standard debug module.
 * The returned function can consume strings or Error objects.
 */
export function error(debug) {
  return function(e) {
    debug(e);
    pushError({
      timestamp: time.now(),
      ...e,
    });
  };
}

/**
 * Returns an error recording function that wraps a debugger
 * provided by the standard debug module.
 * The returned function consumes records supplied by the client.
 */
export function clientError(debug) {
  return function(e) {
    debug(e);
    pushError({
      timestamp: time.now(),
      ...e,
    });
  };
}

export const emitter = new EventEmitter();
