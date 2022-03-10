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

import {easyLog} from '../../lib/log.js';
import * as monitor from '../monitoring/monitor.js';
import {Rectangle} from '../../lib/math/rectangle.js';
import {now} from '../util/time.js';
import {installModuleOverlayHandler, makeModuleOverlaySocket, cleanupModuleOverlayHandler} from '../../lib/socket_wrapper.js';
import {WSS} from './websocket.js';

let io;

const logClientError = () => {};

const log = easyLog('wall:network');

class ClientInfo {
  constructor(offset, rect, socket) {
    this.offset = offset;
    this.rect = rect;
    this.socket = socket;
  }
}

export function getSocket() {
  return io;
}

export const clients = {};

export function sendToAllClients(msgType, payload) {
  io.sendToAllClients(msgType, payload);
}

const specialHandlers = new Map([['new-client', []]]);
const preinitHandlers = [];
function addHandler(msgType, handler, once) {
  if (specialHandlers.has(msgType)) {
    // No once support...
    specialHandlers.get(msgType).push(handler);
  } else if (io) {
    if (once) {
      io.once(msgType, handler);
    } else {
      io.on(msgType, handler);
    }
  } else {
    preinitHandlers.push({msgType, handler, once});
  }
}

export function on(msgType, handler) {
  addHandler(msgType, handler, false);
}

export function once(msgType, handler) {
  addHandler(msgType, handler, true);
}

export function fireSpecialHandler(msgType, payload) {
  const handlers = specialHandlers.get(msgType) || [];
  for (const handler of handlers) {
    handler(payload);
  }
}

/**
 * Main entry point for networking.
 * Initializes the networking layer, given an httpserver instance.
 */
export function init(server) {
  // Disable per-message compression, because it causes big issues on linux.
  // https://github.com/websockets/ws#websocket-compression
  io = new WSS({server});
  
  // Set up control io namespace.
  io.on('connection', socket => {
    // When the client boots, it sends a start message that includes the rect
    // of the client. We listen for that message and register that client info.
    socket.on('client-start', config => {
      const clientRect = Rectangle.deserialize(config.rect);
      if (!clientRect) {
        log.error(`Bad client configuration: `, config);
        // Close the connection with this client.
        socket.disconnect(true);
        return;
      }
      const client = new ClientInfo(config.offset, clientRect, socket);
      if (monitor.isEnabled()) {
        monitor.update({layout: {
          time: now(),
          event: `newClient: ${client.rect.serialize()}`,
        }});
      }
      clients[client.socket.id] = client;
      log(`New client: ${client.rect.serialize()}`);
      fireSpecialHandler('new-client', client);
      // Tell the client the current time.
      socket.send('time', now());
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
        log(`Lost client: ${rect.serialize()}`);
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

    // Install the machinery so that we can receive messages on the per-module
    // network from this client.
    installModuleOverlayHandler(socket);
  });

  for (const tuple of preinitHandlers) {
    const {msgType, handler, once} = tuple;
    // Now that io is defined...
    addHandler(msgType, handler, once);
  }
  preinitHandlers.length = 0;

  // Set up a timer to send the current time to clients every 10 seconds.
  setInterval(() => {
    io.sendToAllClients('time', now());
  }, 10000);
}

// Return an object that can be opened to create an isolated per-module network,
// and closed to clean up after that module.
export function forModule(id) {
  // The list of external sockets opened by this module.
  const openedSockets = [];
  return {
    open() {
      return makeModuleOverlaySocket(id, io, {
        // Here, we provide a per-module list of clients that the module
        // can inspect and invoke. Because our list contains unwrapped sockets,
        // we need to wrap them before exposing them to the module.
        // TODO(applmak): If a module chooses to listen on a per-client wrapped
        // socket like this, it will remove other any such listener. Fix this
        // in order to match socket.io behavior, if possible.
        clients() {
          return Object.keys(clients).reduce((agg, clientId) => {
            agg[clientId] = {
              ...clients[clientId],
              socket: makeModuleOverlaySocket(id, clients[clientId].socket),
            };
            return agg;
          }, {});
        },
      });
    },
    close() {
      cleanupModuleOverlayHandler(id);
      openedSockets.forEach(s => s.disconnect(true));
      openedSockets.length = 0;
    },
  };
}
