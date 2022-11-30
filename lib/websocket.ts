// deno-lint-ignore-file no-explicit-any
import { EventEmitter, Handler } from "./event.ts";
import { easyLog } from "./log.ts";
import { delay } from "./promise.ts";

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

export type Exact<T, Goal> = T extends Goal
  ? Exclude<keyof T, keyof Goal> extends never ? T : never
  : never;

export interface TypedWebsocketLike {
  on<K extends keyof EmittedEvents, V>(
    msg: K,
    handler: HandlerWithSocket<EmittedEvents[K]>,
  ): void;
  once<K extends keyof EmittedEvents, V>(
    msg: K,
    handler: HandlerWithSocket<EmittedEvents[K]>,
  ): void;
  send<K extends keyof EmittedEvents, V>(
    msg: K,
    ...payload: Parameters<EmittedEvents[K]>
  ): void;
  close(): void;
}

type ParametersWithSocket<T extends (...args: unknown[]) => void> = [
  ...Parameters<T>,
  TypedWebsocketLike,
];

export type HandlerWithSocket<T extends (...args: any[]) => void> = (
  ...args: ParametersWithSocket<T>
) => void;

export class WS extends EventEmitter implements TypedWebsocketLike {
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
            log.debugAt(1, `Reconnect error`, err);
            // Hmm, need to wait a bit, then retry.
            await delay(backoffMs);
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
        this.emit("connect");
      });
      this.isOpen = false;
    } else {
      this.isOpen = true;
      this.emit("connect");
    }
    this.websocket.addEventListener("error", (err) => {
      log.debugAt(1, `Error: ${err}`);
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
        this._bindToWebsocket(newWebsocket);
      }
    });
    this.websocket.addEventListener("message", (message) => {
      const { data } = message;
      try {
        const [type, payload] = parseMessage(data);
        log.debugAt(
          2,
          `For message type: ${type} there are ${this.handlers.get(type)
            ?.length} handlers`,
        );
        // Use the event emitter because type is already prefixed.
        super.emit(type, ...payload, this);
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
  on<K extends keyof EmittedEvents, V>(
    msg: K,
    handler: HandlerWithSocket<EmittedEvents[K]>,
  ) {
    super.on(msg, handler as Handler);
  }
  once<K extends keyof EmittedEvents, V>(
    msg: K,
    handler: HandlerWithSocket<EmittedEvents[K]>,
  ) {
    super.once(msg, handler as Handler);
  }
  emit<K extends keyof EmittedEvents, V>(
    msg: K,
    ...payload: Exact<V, Parameters<EmittedEvents[K]>>
  ) {
    super.emit(msg, ...payload, this);
  }
  send<K extends keyof EmittedEvents, V>(
    msg: K,
    ...payload: Exact<V, Parameters<EmittedEvents[K]>>
  ) {
    if (this.isOpen) {
      if (this.websocket.readyState != 1) {
        log.warn(
          `Websocket open state does not match ready state: ${this.websocket.readyState}`,
        );
        this.buffer.push(serializeMessage(msg, payload));
      } else {
        this.websocket.send(serializeMessage(msg, payload));
      }
    } else {
      this.buffer.push(serializeMessage(msg, payload));
    }
  }
  close() {
    this.isOpen = false;
    if (this.stopRetryingSignal) {
      this.stopRetryingSignal.abort();
    }
    this.handlers.clear();
  }
}

export class ModuleWS implements TypedWebsocketLike {
  readonly registeredMsgTypes = new Set<string>();
  constructor(readonly ws: WS, readonly moduleId: string) {}
  on<K extends keyof EmittedEvents>(
    msg: K,
    handler: HandlerWithSocket<EmittedEvents[K]>,
  ) {
    const type = `${this.moduleId}:${msg}`;
    this.registeredMsgTypes.add(type);
    this.ws.on(
      type as keyof EmittedEvents,
      (...payload) => {
        // Replace the non-module socket at the end of this list (added by WS emit) with this.
        payload.pop();
        payload.push(this);
        handler(...payload as any);
      },
    );
  }
  once<K extends keyof EmittedEvents>(
    msg: K,
    handler: HandlerWithSocket<EmittedEvents[K]>,
  ) {
    const type = `${this.moduleId}:${msg}`;
    this.registeredMsgTypes.add(type);
    this.ws.once(
      type as keyof EmittedEvents,
      (...payload) => {
        payload.pop();
        payload.push(this);
        handler(...payload as any);
      },
    );
  }
  send<K extends keyof EmittedEvents, V>(
    msg: K,
    ...payload: Exact<V, Parameters<EmittedEvents[K]>>
  ): void {
    const type = `${this.moduleId}:${msg}`;
    this.ws.send(type as any, ...payload as any[]);
  }
  close(): void {
    for (const type of this.registeredMsgTypes) {
      this.ws.remoteAllListeners(type);
    }
  }
}

declare global {
  interface EmittedEvents {
    connect(): void;
    disconnect(code: number, reason: string): void;
  }
}
