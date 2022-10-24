import { EventEmitter, Handler } from "../../lib/event.ts";
import { Exact, WS } from "../../lib/websocket.ts";
import { easyLog } from "../../lib/log.ts";
import { DispatchServer } from "../util/serving.ts";
import { EmitOptions } from "https://deno.land/x/emit@0.9.0/mod.ts";

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
  sendToAllClients<K extends keyof EmittedEvents, V>(
    msg: K,
    ...payload: Exact<V, Parameters<EmittedEvents[K]>>
  ) {
    for (const websocket of this.clientSockets) {
      websocket.sendWithRoom("", msg, ...payload);
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

type ParametersWithSocket<T extends (...args: unknown[]) => void> = T extends
  (...args: infer P) => void ? [...P, WS] : never;

type HandlerWithSocket<T extends (...args: any[]) => void> = (
  ...args: ParametersWithSocket<T>
) => void;

export class WSSWrapper {
  readonly savedHandlers = new Set<{ type: string; fn: Handler }>();
  constructor(readonly wss: WSS, readonly room: string) {}
  on<K extends keyof EmittedEvents>(
    type: K,
    fn: HandlerWithSocket<EmittedEvents[K]>,
  ): void {
    this.savedHandlers.add({ type: type as string, fn: fn as Handler });
    const msg = `${this.room || "global"}:${type}`;
    this.wss.on(msg, fn as Handler);
  }
  once<K extends keyof EmittedEvents>(
    type: K,
    fn: HandlerWithSocket<EmittedEvents[K]>,
  ): void {
    this.savedHandlers.add({ type: type as string, fn: fn as Handler });
    const msg = `${this.room || "global"}:${type}`;
    this.wss.once(msg, fn as Handler);
  }
  sendToAllClients<K extends keyof EmittedEvents, V>(
    type: K,
    ...payload: Exact<V, Parameters<EmittedEvents[K]>>
  ) {
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
  on<K extends keyof EmittedEvents>(
    type: K,
    fn: HandlerWithSocket<EmittedEvents[K]>,
  ): void {
    this.savedHandlers.add({ type, fn: fn as Handler });
    const msg = `${this.room || "global"}:${type}`;
    this.ws.on(msg as keyof EmittedEvents, fn as Handler);
  }
  once<K extends keyof EmittedEvents>(
    type: K,
    fn: HandlerWithSocket<EmittedEvents[K]>,
  ): void {
    this.savedHandlers.add({ type, fn: fn as Handler });
    const msg = `${this.room || "global"}:${type}`;
    this.ws.once(msg as keyof EmittedEvents, fn as Handler);
  }
  send<K extends keyof EmittedEvents, V>(
    type: K,
    ...payload: Exact<V, Parameters<EmittedEvents[K]>>
  ) {
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
