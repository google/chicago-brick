import { EventEmitter } from "../../lib/event.ts";
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
