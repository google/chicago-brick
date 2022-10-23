import { EventEmitter, Handler } from "../../lib/event.ts";
import { WS } from "../../lib/websocket.ts";
import { easyLog } from "../../lib/log.ts";
import { DispatchServer } from "../util/serving.ts";

const log = easyLog("wall:websocket");

interface WSSOptions {
  /** When specified, opens a new server on this port. */
  port?: number;
  /** If port is not specified, use this dispatchserver as the server. */
  server?: DispatchServer;
  /** The path on the server that should be intercepted for these websocket requests. */
  path?: string;

  /** If we should bind to an existing WebSocketServer, provide it here. */
  existingWSS?: WebSocketServer;
}

export class WebSocketServer extends EventEmitter {
  server: DispatchServer;
  constructor(options: WSSOptions) {
    super();
    if (options.port) {
      this.server = new DispatchServer({ port: options.port });
    } else {
      this.server = options.server!;
    }
    options.path = options.path ?? "/websocket";

    this.server.addHandler(options.path, (req: Request) => {
      // Assert upgrade to websocket.
      const upgrade = req.headers.get("upgrade") || "";
      if (upgrade.toLowerCase() != "websocket") {
        return Promise.resolve(
          new Response("request isn't trying to upgrade to websocket."),
        );
      }
      const { socket, response } = Deno.upgradeWebSocket(req);
      this.emit("connection", socket);
      return Promise.resolve(response);
    });
    this.server.start();
  }
}

export class WSS extends EventEmitter {
  webSocketServer: WebSocketServer;
  clientSockets: Set<WS>;
  constructor(options: WSSOptions) {
    super();
    this.webSocketServer = options.existingWSS ?? new WebSocketServer(options);
    this.clientSockets = new Set();
    this.webSocketServer.on("connection", (websocket: WebSocket) => {
      const ws = WS.serverWrapper(websocket);
      this.clientSockets.add(ws);
      ws.on("disconnect", (code: number, reason: string) => {
        log.error(`Lost client: ${code} Reason: ${reason}`);
        this.clientSockets.delete(ws);
        this.emit("disconnect", ws);
      });
      this.emit("connection", ws);
    });
  }
  sendToAllClients(msg: string, ...payload: unknown[]) {
    for (const websocket of this.clientSockets) {
      websocket.send(msg, ...payload);
    }
  }
  createRoom(room: string) {
    return new WSSWrapper(this, room);
  }
  close() {
    this.handlers.clear();
    this.clientSockets.clear();
  }
}

export class WSSWrapper {
  readonly savedHandlers = new Set<{ type: string; fn: Handler }>();
  constructor(readonly wss: WSS, readonly room: string) {}
  on(type: string, fn: Handler): void {
    this.savedHandlers.add({ type, fn });
    type = `${this.room || "global"}:${type}`;
    this.wss.on(type, fn);
  }
  once(type: string, fn: Handler): void {
    this.savedHandlers.add({ type, fn });
    type = `${this.room || "global"}:${type}`;
    this.wss.once(type, fn);
  }
  sendToAllClients(type: string, ...payload: unknown[]): void {
    // Send to sockets with our current room.
    for (const websocket of this.wss.clientSockets) {
      websocket.sendWithRoom(this.room, type, ...payload);
    }
  }
  removeListener(type: string, fn: Handler): void {
    for (const saved of [...this.savedHandlers]) {
      if (saved.type === type && saved.fn === fn) {
        this.savedHandlers.delete(saved);
      }
    }
    this.wss.removeListener(type, fn);
  }
  clients() {
    const clients = [];
    for (const ws of this.wss.clientSockets) {
      clients.push(new WSWrapper(ws, this.room));
    }
    return clients;
  }
  close() {
    // Unregister all of the handlers that this guy registered.
    for (const saved of this.savedHandlers) {
      this.wss.removeListener(saved.type, saved.fn);
    }
    this.savedHandlers.clear();
  }
}

export class WSWrapper {
  readonly savedHandlers = new Set<{ type: string; fn: Handler }>();
  constructor(readonly ws: WS, readonly room: string) {}
  on(type: string, fn: Handler): void {
    this.savedHandlers.add({ type, fn });
    type = `${this.room || "global"}:${type}`;
    this.ws.on(type, fn);
  }
  once(type: string, fn: Handler): void {
    this.savedHandlers.add({ type, fn });
    type = `${this.room || "global"}:${type}`;
    this.ws.once(type, fn);
  }
  send(type: string, ...payload: unknown[]): void {
    this.ws.sendWithRoom(this.room, type, ...payload);
  }
  removeListener(type: string, fn: Handler): void {
    for (const saved of [...this.savedHandlers]) {
      if (saved.type === type && saved.fn === fn) {
        this.savedHandlers.delete(saved);
      }
    }
    this.ws.removeListener(type, fn);
  }
  close() {
    // Unregister all of the handlers that this guy registered.
    for (const saved of this.savedHandlers) {
      this.ws.removeListener(saved.type, saved.fn);
    }
    this.savedHandlers.clear();
  }
}
