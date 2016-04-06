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

var server = require('http').createServer();
var io = require('socket.io')(server);
var debug = require('debug')('chicago-brick-live:code-server');

var clientCode = require('./client-code');
import { default as ClientLock } from './client-lock';

let clientLock  = new ClientLock();

function GetClientInfo(client) {
  return {
    client: client,
    controlled: clientLock.isLocked(client),
    code: clientCode.get(client),
  };
}

io.on('connection', function(socket){
  debug(`Client connected (${socket.request.connection.remoteAddress})`);

  socket.on('requestCode', function(data) {
    debug('requestCode: ', data);
    var clientInfo = GetClientInfo(data.client);

    if (data.tryLock) {
        let token = clientLock.tryLock(data.client);

        if(token) {
          // Auto release token when token owner disconnects, this avoids a
          // token that cannot be released.
          socket.on('disconnect', function() {
            clientLock.release(data.client, token);
            // Notify all but sender.
            debug('Notifying for ', data.client);
            socket.broadcast.emit('code', GetClientInfo(data.client));
          });

          clientInfo.token = token;

          // If the token was granted, then notify all (except requestor) so
          // they are informed that the code is now controlled.
          socket.broadcast.emit('code', GetClientInfo(data.client));
        }
    }

    // Response to requestor ONLY (since this may have token).
    debug('Notifying for ', data.client);
    socket.emit('code', clientInfo);
  });

  socket.on('releaseToken', function(data) {
    debug('releaseToken: ', data);
    clientLock.release(data.client, data.token);

    // Notify all but sender.
    debug('Notifying for ', data.client);
    socket.broadcast.emit('code', GetClientInfo(data.client));
  });

  socket.on('storeCode', function(data) {
    debug('storeCode: ', data);

    if (data.token && clientLock.validateToken(data.client, data.token)) {
      clientCode.put(data.client, data.code);

      // Notify all but sender.
      debug('Notifying for ', data.client);
      socket.broadcast.emit('code', GetClientInfo(data.client));
    }
  });

  socket.on('error', function(e) {
      debug(`ERROR: ${e}`);
  });

  socket.on('disconnect', function() {
    debug(`Client disconnected (${socket.request.connection.remoteAddress})`);
  });
});

debug('Starting code-server on 3001');
server.listen(3001);
