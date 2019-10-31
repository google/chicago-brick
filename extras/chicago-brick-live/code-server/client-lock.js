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

var debug = require('debug')('chicago-brick-live:code-server:client-lock');

function clientKey(client) {
  return `${client.x},${client.y}`;
}

export class ClientLock {
  constructor() {
    this._lockTokens = {};
  }

  tryLock(client) {
    debug(`Lock requested for client (${client.x},${client.y}).`);

    if (this.isLocked(client)) {
      debug(`Client (${client.x},${client.y}) already locked.`);
      return undefined;
    } else {
      // TODO Generate a real token (JWT?)
      debug(`Generating new lock token for client (${client.x},${client.y}).`);
      var key = clientKey(client);
      this._lockTokens[key] = Math.random();
      return this._lockTokens[key];
    }
  }

  isLocked(client) {
    return (clientKey(client) in this._lockTokens);
  }

  validateToken(client, token) {
    return (token && token == this._lockTokens[clientKey(client)]);
  }

  release(client, token) {
    if (this.validateToken(client, token)) {
      delete this._lockTokens[clientKey(client)];
    }
  }
}
