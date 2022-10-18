import { EventEmitter } from "./event.ts";
import { easyLog } from "./log.ts";

const log = easyLog("wall:websocket");

function parseMessage(data: string): [string, unknown[]] {
  const json = JSON.parse(data);
  const [type, payload] = json;
  return [type, payload];
}
function serializeMessage(type: string, payload: unknown[]): string {
  return JSON.stringify([type, payload]);
}

type RetryStrategy = (signal: AbortSignal) => Promise<WebSocket>;

export class WS extends EventEmitter {
  static serverWrapper(websocket: WebSocket) {
    return new WS(websocket, null);
  }
  static clientWrapper(href: string) {
    return new WS(new WebSocket(href), async (signal: AbortSignal) => {
      let backoffMs = 100;
      const tryReconnect: () => Promise<WebSocket> = () => {
        return new Promise((resolve, reject) => {
          const newWebSocket = new WebSocket(href);
          newWebSocket.onopen = () => {
            resolve(newWebSocket);
          };
          newWebSocket.onerror = async (err) => {
            log.error(err);
            // Hmm, need to wait a bit, then retry.
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            backoffMs *= 2;
            backoffMs = Math.min(backoffMs, 5000);
            if (signal.aborted) {
              reject(new Error("Retry aborted."));
            }
            resolve(tryReconnect());
          };
        });
      };
      return await tryReconnect();
    });
  }

  websocket!: WebSocket;
  stopRetryingSignal: AbortController | null = null;
  buffer: string[] = [];
  isOpen = false;

  constructor(
    websocket: WebSocket,
    readonly retryStrategy: RetryStrategy | null,
  ) {
    super();
    this._bindToWebsocket(websocket);
  }
  _bindToWebsocket(websocket: WebSocket) {
    this.websocket = websocket;
    if (this.websocket.readyState != 1) { // OPEN
      // Listen for the open event, and buffer new messages until then.
      this.websocket.addEventListener("open", () => {
        this.sendBufferedMessages();
        this.isOpen = true;
        this.emit("connect", this);
      });
      this.isOpen = false;
    } else {
      this.isOpen = true;
    }
    this.websocket.addEventListener("error", (err) => {
      log.error(err);
    });
    this.websocket.addEventListener("close", async (event) => {
      if (this.isOpen) {
        // Let any listeners know that we disconnected.
        this.emit("disconnect", event.code, event.reason);
      }
      this.isOpen = false;
      if (this.retryStrategy) {
        this.stopRetryingSignal = new AbortController();
        // Ah! Try to reconnect to the server!
        const newWebsocket = await this.retryStrategy(
          this.stopRetryingSignal.signal,
        );
        // This won't fire the 'connect' event, because it's already connected.
        this._bindToWebsocket(newWebsocket);
        this.emit("connect", this);
      }
    });
    this.websocket.addEventListener("message", (message) => {
      const { data } = message;
      try {
        const [type, payload] = parseMessage(data);
        this.emit(type, ...payload);
      } catch (e) {
        log.error("Failed to parse message:", e);
        return;
      }
    });
  }
  sendBufferedMessages() {
    if (this.websocket.readyState != 1) {
      throw new Error(
        "Asked to send buffered messages on a non-open websocket!",
      );
    }
    for (const msg of this.buffer) {
      this.websocket.send(msg);
    }
    this.buffer.length = 0;
  }
  send(msg: string, ...payload: unknown[]) {
    if (this.isOpen) {
      this.websocket.send(serializeMessage(msg, payload));
    } else {
      this.buffer.push(serializeMessage(msg, payload));
    }
  }
  close() {
    this.isOpen = false;
    if (this.stopRetryingSignal) {
      this.stopRetryingSignal.abort();
    }
  }
}
