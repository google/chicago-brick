import * as network from "../network/network.js";
import { WS } from "../../lib/websocket.js";

network.on("connection", (socket: WS) => {
  socket.on("record-error", (err: unknown) => {
    addToBuffer(err);
  });
});

const buffer: unknown[] = [];
function addToBuffer(item: unknown) {
  buffer.push(item);
  if (buffer.length > 100) {
    buffer.shift();
  }
}

/** Returns the last N errors. */
export function getErrors() {
  return buffer;
}

/** Saves a server-generated error into the last N errors list. */
export function captureLog(channel: string, severity: number, args: unknown[]) {
  if (severity < 0) {
    addToBuffer({
      channel,
      severity,
      ...args,
    });
  }
}
