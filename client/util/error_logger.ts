import { socket } from "../network/network.ts";
import { now } from "../../lib/adjustable_time.ts";
import { virtualRect } from "./info.ts";

export interface RecordErrorMessage {
  message?: string;
  stack?: string;
  namespace: string;
  timestamp: number;
  client: string;
  channel: string;
  severity: number;
  args: unknown[];
}

export function errorLogger(
  channel: string,
  severity: number,
  args: unknown[],
) {
  if (severity >= 0) {
    return;
  }

  const errorBits = {} as RecordErrorMessage;
  if (args[0] instanceof Error) {
    const error = args.shift() as Error;
    errorBits.message = error.message;
    errorBits.stack = error.stack;
  }

  errorBits.namespace = channel;
  errorBits.timestamp = now();
  errorBits.client = virtualRect.serialize();
  errorBits.channel = channel;
  errorBits.severity = severity;
  errorBits.args = args;

  socket.send("record-error", errorBits);
}

declare global {
  interface EmittedEvents {
    "record-error": (error: RecordErrorMessage) => void;
  }
}
