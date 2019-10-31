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
import _ from 'underscore';
import { RECEIVE_CODE, REQUEST_CODE, STORE_CODE, CLEAR_TOKEN } from '../actions';

var logger = require('debug')('chicago-brick-live:editor-server:reducers');

// Initial application state.
const initialState = {
    client: {
      x: undefined,
      y: undefined
    },
    // code unsaved
    dirty: false,
    // The actual code
    value: undefined,
    // code token (allow saving and indicates control)
    token: undefined,
    // Ongoing operations,
    isFetching: false,
    isSaving: false,
};

// State update
export function clientCodeReducer(state = initialState, action) {
  switch (action.type) {
    case STORE_CODE:
      return Object.assign({}, state, {
        isSaving: true,
      });

    case CLEAR_TOKEN:
      return Object.assign({}, state, {
        token: undefined,
      });

    case REQUEST_CODE:
      return Object.assign({}, state, {
          client: action.client,
          isFetching: true,
      });

    case RECEIVE_CODE:
      if (state.client && _.isEqual(action.client, state.client)) {
        logger('Code is for current client, updating state');
        return Object.assign({}, state, {
            value: action.code,
            token: action.token,
            isFetching: false,
            isSaving: false,
            dirty: false,
        });
      } else {
          logger(`Code is is for client ${action.client.x},${action.client.y}), current client is (${state.client.x},${state.client.y}.  Ignoring`);
      }
      break;
  }

  return state;
}
