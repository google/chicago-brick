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

import { easyLog } from "../../lib/log.ts";
import * as monitor from "../monitoring/monitor.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import { now } from "../util/time.ts";
import {
  cleanupModuleOverlayHandler,
  installModuleOverlayHandler,
  makeModuleOverlaySocket,
} from "../../lib/socket_wrapper.js";
import { WSS } from "./websocket.ts";
import { WS } from "../../lib/websocket.ts";
import { DispatchServer } from "../util/serving.ts";

let io: WSS;

const log = easyLog("wall:network");

interface Point {
  x: number;
  y: number;
}

class ClientInfo {
  constructor(
    readonly offset: Point,
    readonly rect: Rectangle,
    readonly socket: WS,
  ) {
  }
}

export function getSocket(): WSS {
  return io;
}

export const clients: Record<string, ClientInfo> = {};

export function sendToAllClients(msgType: string, payload: unknown) {
  io.sendToAllClients(msgType, payload);
}

type Handler = (payload: any) => void;

interface SavedMessage {
  msgType: string;
  handler: Handler;
  once: boolean;
}

const specialHandlers = new Map<string, Handler[]>([["new-client", []]]);
const preinitHandlers: SavedMessage[] = [];
function addHandler(msgType: string, handler: Handler, once: boolean) {
  if (specialHandlers.has(msgType)) {
    // No once support...
    specialHandlers.get(msgType)!.push(handler);
  } else if (io) {
    if (once) {
      io.once(msgType, handler);
    } else {
      io.on(msgType, handler);
    }
  } else {
    preinitHandlers.push({ msgType, handler, once });
  }
}

export function on(msgType: string, handler: Handler) {
  addHandler(msgType, handler, false);
}

export function once(msgType: string, handler: Handler) {
  addHandler(msgType, handler, true);
}

export function fireSpecialHandler(msgType: string, payload: unknown) {
  const handlers = specialHandlers.get(msgType) || [];
  for (const handler of handlers) {
    handler(payload);
  }
}

let nextClientId = 1;

interface ClientConfig {
  rect: Rectangle;
  offset: Point;
}

interface PerModuleClientInfo extends ClientConfig {
  // TODO: Make this more accurate.
  socket: unknown;
}

/**
 * Main entry point for networking.
 * Initializes the networking layer, given an httpserver instance.
 */
export function init(server: DispatchServer) {
  // Disable per-message compression, because it causes big issues on linux.
  // https://github.com/websockets/ws#websocket-compression
  io = new WSS({ server });
  io.on("connection", (socket: WS) => {
    const clientId = nextClientId++;
    // When the client boots, it sends a start message that includes the rect
    // of the client. We listen for that message and register that client info.
    socket.on("client-start", (config: ClientConfig) => {
      const clientRect = Rectangle.deserialize(config.rect);
      if (!clientRect) {
        log.error(`Bad client configuration: `, config);
        // Close the connection with this client.
        socket.close();
        return;
      }
      const client = new ClientInfo(config.offset, clientRect, socket);
      if (monitor.isEnabled()) {
        monitor.update({
          layout: {
            time: now(),
            event: `newClient: ${client.rect.serialize()}`,
          },
        });
      }
      clients[clientId] = client;
      log(`New client: ${client.rect.serialize()}`);
      fireSpecialHandler("new-client", client);
      // Tell the client the current time.
      socket.send("time", now());
    });

    // When the client disconnects, we tell our listeners that we lost the client.
    socket.once("disconnect", () => {
      if (clientId in clients) {
        const { rect } = clients[clientId];
        if (monitor.isEnabled()) {
          monitor.update({
            layout: {
              time: now(),
              event: `dropClient: ${rect.serialize()}`,
            },
          });
        }
        log(`Lost client: ${rect.serialize()}`);
      } else {
        if (monitor.isEnabled()) {
          monitor.update({
            layout: {
              time: now(),
              event: `dropClient: id ${clientId}`,
            },
          });
        }
      }
      delete clients[clientId];
    });

    // If the client notices an exception, it can send us that information to
    // the server via this channel. The framework might choose to respond to
    // this by, say, moving on to the next module.
    // socket.on("record-error", ...);

    // Install the machinery so that we can receive messages on the per-module
    // network from this client.
    installModuleOverlayHandler(socket);
  });

  for (const tuple of preinitHandlers) {
    const { msgType, handler, once } = tuple;
    // Now that io is defined...
    addHandler(msgType, handler, once);
  }
  preinitHandlers.length = 0;

  // Set up a timer to send the current time to clients every 10 seconds.
  setInterval(() => {
    io.sendToAllClients("time", now());
  }, 10000);
}

// Return an object that can be opened to create an isolated per-module network,
// and closed to clean up after that module.
export function forModule(id: string) {
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
          }, {} as Record<string, PerModuleClientInfo>);
        },
      });
    },
    close() {
      cleanupModuleOverlayHandler(id);
    },
  };
}
