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
import { requestCode, receiveCode } from './actions';

var io = require('socket.io-client');
var logger = require('debug')('chicago-brick-live:editor-server:code-server-client');

// Singleton codeserver used by the entire application.
// TODO Is there a way to not have this be a singleton and inject it into
// the actions?
export let codeServer;

export function initializeCodeServer(connectionString, store) {
  logger(`Initializing codeserver connection to ${connectionString}`);
  codeServer = io(connectionString);

  codeServer.on('connect', function() {
    logger('Connected to CodeServer');
  });

  codeServer.on('disconnect', function() {
    logger('Disconnected from CodeServer');
  });

  // Setup the code server to dispatch an action whenever ANY code comes.  The
  // reducers figure out if the data are needed and update the state accordingly.
  codeServer.on('code', function(data) {
    logger(`Received code for client (${data.client.x},${data.client.y})`);
    store.dispatch(receiveCode(data.client, data.code, data.token));
  });
}
