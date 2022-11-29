import * as network from "../network/network.ts";
import { TypedWebsocketLike } from "../../lib/websocket.ts";
import { RecordErrorMessage } from "../../client/util/error_logger.ts";

network.wss.on("connection", (socket: TypedWebsocketLike) => {
  socket.on("record-error", (err: RecordErrorMessage) => {
    addToBuffer(err);
  });
});

const buffer: RecordErrorMessage[] = [];
function addToBuffer(item: RecordErrorMessage) {
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
      ...args as unknown as RecordErrorMessage,
      channel,
      severity,
    });
  }
}
