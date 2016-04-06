/* Copyright 2016 Google Inc. All Rights Reserved.
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

var debug = require('debug')('live-client:server:client-code');
var fs = require('fs');

// Path to where client code is stored.
var CLIENT_CODE = 'client-code';

function ClientFilename(client) {
  return `${CLIENT_CODE}/client_x=${client.x},y=${client.y}.js`;
}

exports.put = function(client, code) {
  var clientFile = ClientFilename(client);
  debug(`Storing code to ${clientFile}`);
  fs.writeFileSync(clientFile, code, 'utf8');
};

exports.get = function(client) {
  var clientFile = ClientFilename(client);
  debug(`Code requested for client (${client.x},${client.y}).`);

  var code;
  try {
    code = fs.readFileSync(clientFile, 'utf8').trim();
    debug(`Sending code from disk (${clientFile}).`);
  } catch (e) {
    debug(e);
    debug(`Requested file (${clientFile}) cannot be read.`);
  }

  return code;
};
