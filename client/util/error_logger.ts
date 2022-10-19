import { send } from "../network/network.ts";
import { now } from "../../lib/adjustable_time.ts";
import { virtualRect } from "./info.ts";

interface RecordErrorMessage {
  message?: string;
  stack?: string;
  namespace: string;
  timestamp: number;
  client: string;
  channel: string;
  severity: number;
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
    errorBits.message = args[0].message;
    errorBits.stack = args[0].stack;
  }

  send("record-error", {
    ...args,
    ...errorBits,
    namespace: channel,
    timestamp: now(),
    client: virtualRect.serialize(),
    channel,
    severity,
  });
}
