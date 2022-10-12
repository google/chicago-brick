import EventEmitter from "https://deno.land/x/eventemitter@1.2.4/mod.ts";
import { WS } from "../../lib/websocket.js";
import { easyLog } from "../../lib/log.js";
import { DispatchServer } from "../util/serving.ts";

const log = easyLog("wall:websocket");

interface WSSOptions {
  port?: number;
  server?: DispatchServer;
}

export class WebSocketServer extends EventEmitter<any> {
  server: DispatchServer;
  constructor(options: WSSOptions) {
    super();
    if (options.port) {
      this.server = new DispatchServer({ port: options.port });
    } else {
      this.server = options.server!;
    }
    this.server.addHandler("/websocket", (req: Request) => {
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

export class WSS extends EventEmitter<any> {
  webSocketServer: WebSocketServer;
  clientSockets: Set<WS>;
  constructor(options: WSSOptions) {
    super();
    this.webSocketServer = new WebSocketServer(options);
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
  sendToAllClients(msg: string, payload: unknown) {
    for (const websocket of this.clientSockets) {
      websocket.send(msg, payload);
    }
  }
}
