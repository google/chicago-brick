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

import Debug from 'debug';
import * as monitor from '../monitoring/monitor.js';
import ioClient from 'socket.io-client';
import socketio from 'socket.io';
import {EventEmitter} from 'events';
import {Rectangle} from '../../lib/math/rectangle.js';
import {clientError} from '../util/log.js';
import {now} from '../util/time.js';
let io;

const logClientError = clientError(Debug('wall:client_error'));

const debug = Debug('wall:network');

class ClientInfo {
  constructor(rect, socket) {
    this.rect = rect;
    this.socket = socket;
  }
}

export function getSocket() {
  return io;
}

export const clients = {};
export const emitter = new EventEmitter;
/**
 * Main entry point for networking.
 * Initializes the networking layer, given an httpserver instance.
 */
export function init(server) {
  io = socketio(server);

  io.on('connection', socket => {
    // If any client asks for the current time, we tell them.
    socket.on('time', () => {
      socket.emit('time', now());
    });
    // When the client boots, it sends a start message that includes the rect
    // of the client. We listen for that message and register that client info.
    socket.on('client-start', config => {
      const clientRect = Rectangle.deserialize(config.rect);
      if (!clientRect) {
        debug(`Bad client configuration: `, config);
        // Close the connection with this client.
        socket.disconnect(true);
        return;
      }
      const client = new ClientInfo(clientRect, socket);
      if (monitor.isEnabled()) {
        monitor.update({layout: {
          time: now(),
          event: `newClient: ${client.rect.serialize()}`,
        }});
      }
      clients[client.socket.id] = client;
      debug(`New display: ${client.rect.serialize()}`);
      emitter.emit('new-client', client);

      socket.emit('time', now());
    });

    // When the client disconnects, we tell our listeners that we lost the client.
    socket.once('disconnect', function() {
      const {id} = socket;
      if (id in clients) {
        const {rect} = clients[id];
        if (monitor.isEnabled()) {
          monitor.update({layout: {
            time: now(),
            event: `dropClient: ${rect.serialize()}`,
          }});
        }
        debug(`Lost display: ${rect.serialize()}`);
        emitter.emit('lost-client', clients[id]);
      } else {
        if (monitor.isEnabled()) {
          monitor.update({layout: {
            time: now(),
            event: `dropClient: id ${id}`,
          }});
        }
      }
      delete clients[id];
    });

    // If the client notices an exception, it can send us that information to
    // the server via this channel. The framework might choose to respond to
    // this by, say, moving on to the next module.
    socket.on('record-error', function(e) {
      logClientError(e);
    });
  });

  // Set up a timer to send the current time to clients every 10 seconds.
  setInterval(() => {
    io.emit('time', now());
  }, 10000);
}

export function controlSocket() {
  return io.of('/control');
}

export function forModule(id) {
  var externalNspName = `module${id.replace(/[^0-9]/g, 'X')}`;
  var internalNspName = `/${externalNspName}`;
  var sockets = [];
  var clients = [];
  return {
    open: function() {
      debug('Opened per-module socket @ ' + id, internalNspName);
      console.assert(!io.nsps[internalNspName]);
      var nsp = io.of(internalNspName);

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
}
