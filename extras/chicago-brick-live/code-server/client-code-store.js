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

var debug = require('debug')('chicago-brick-live:code-server:client-code-store');
var fs = require('fs');
var mkdirp = require('mkdirp');

export class ClientCodeStore {
  constructor(storePath) {
    this._storePath = storePath;

    debug(`Using ${storePath} for client code storage.`);
    mkdirp(storePath, function(err) {
      if (err) {
        debug(`Error creating ${storePath}: $err`);
      }
    });
  }

   _clientFilename(client) {
    return `${this._storePath}/client_x=${client.x},y=${client.y}.js`;
  }

  put(client, code) {
    var clientFile = this._clientFilename(client);
    debug(`Storing code to ${clientFile}`);
    fs.writeFileSync(clientFile, code, 'utf8');
  }

  get(client) {
    var clientFile = this._clientFilename(client);
    debug(`Code requested for client (${client.x},${client.y}).`);

    var code;
    try {
      code = fs.readFileSync(clientFile, 'utf8').trim();
      debug(`Sending code from disk (${clientFile}).`);
    } catch (e) {
      debug(`Requested file (${clientFile}) cannot be read.`);
    }

    return code;
  }
}
