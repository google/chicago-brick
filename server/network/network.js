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

'use strict';
// Maintains all open socket connections to the clients. Because this connection
// is inherently a global singleton, we provide global functions for sending
// information to the clients and for registering for specific messages from
// the clients. The network library maintains the map of virtual screen space
// to client, so that it can provide APIs to send messages to a client that owns
// a specific pixel or rect of screen real estate.

// The library also imposes a specific protocol that all clients must adhere to:
// - After socket init, the server will ask the clients for details of its
//   _config_, and the client will respond with its visible screen rect. If the
//   client fails to do this, the client is considered invalid and omitted from
//   future calculations.

var socketio = require('socket.io');
var ioClient = require('socket.io-client');
var EventEmitter = require('events').EventEmitter;
var Debug = require('debug');
var debug = Debug('wall:network');
var url = require('url');

var Rectangle = require('lib/rectangle');
var error = require('server/util/log')
    .clientError(Debug('wall:client_error'));
var time = require('server/util/time');
var wallGeometry = require('server/util/wall_geometry');

var io;

var network = new EventEmitter;

function installAlwaysAvailableHandlers(socket) {
  // We listen for the time message and respond with the server's version of
  // that time.
  socket.on('time', function() {
    socket.emit('time', time.now());
  });
}

class ClientInfo {
  constructor(rect, socket) {
    this.rect = rect;
    this.socket = socket;
  }
}

function installDisplayClientHandlers(socket) {
  // When the client disconnects, we tell OUR listeners that we lost the client.
  socket.on('disconnect', function() {
    debug('Lost a client!', socket.id);
    network.emit('lost-client', socket.id);
  });

  // When clients initialize, they tell us their display rect. We deserialize
  // the message and broadcast the result out.
  socket.once('config-response', function(config) {
    debug('Client config:', config);
    var rect = Rectangle.deserialize(config);
    if (!rect) {
      console.error('Bad client config! ', config);
      return;
    }
    network.emit('new-client', new ClientInfo(rect, socket));
  });

  socket.on('record-error', function(e) {
    error(e);
  });
}

// Opens a listening websocket by taking a server instance (from the 'http'
// package) OR a simple port (for tests).
network.openWebSocket = function(server) {
  io = socketio(server);

  io.on('connection', function(socket) {
    installAlwaysAvailableHandlers(socket);
    
    var id = url.parse(socket.request.url, true).query.id;
    if (id) {
      // Ignore this, as it's not a main connection.
      return;
    }
    
    debug('New client:', socket.id);
    installDisplayClientHandlers(socket);
    // Tell the clients the whole wall geo.
    socket.emit('config', {});
  });
};

// Closes all communication.
network.close = function() {
  io.close();
  io = undefined;
};

// Sends a message to all clients.
network.broadcast = function(msg, data) {
  io.emit(msg, data);
};

network.forModule = function(id) {
  var externalNspName = `module${id.replace(/[^0-9]/g, 'X')}`;
  var internalNspName = `/${externalNspName}`;
  var sockets = [];
  var clients = [];
  return {
    open: function() {
      debug('Opened per-module socket @ ' + id);
      console.assert(!io.nsps[internalNspName]);
      var nsp = io.of(externalNspName);

      // Expose ioClient via network module.
      nsp.openExternalSocket = function(host) {
        var socket = ioClient(host, {multiplex: false});
        sockets.push(socket);
        return socket;
      };
      
      nsp.on('connection', (socket) => {
        var rect = Rectangle.deserialize(socket.handshake.query.rect);
        clients.push({socket, rect});
        debug(`Tracking per-module connection ${socket.handshake.query.id} from ${rect.serialize()}`, clients.length);
        socket.on('disconnect', () => {
          clients = clients.filter((client) => {
            return client.rect.serialize() !== rect.serialize();
          });
          debug(`Tracking per-module disconnect ${socket.handshake.query.id} from ${rect.serialize()}`, clients.length);
        });
      });
      
      nsp.getClientsInRect = function(rect) {
        return clients.filter((client) => {
          return rect.intersects(client.rect);
        });
      };
      
      return nsp;
    },
    close: function() {
      debug('Closed per-module socket @ ' + id);
      console.assert(io.nsps[internalNspName]);
      io.nsps[internalNspName].removeAllListeners();
      // Clean up any clients left open.
      clients.forEach((c) => {
        c.socket.disconnect();
      });
      // Clean up any sockets left open.
      sockets.forEach((s) => {
        s.disconnect();
      });
      sockets = [];
      delete io.nsps[internalNspName];
    }
  };
};

module.exports = network;
