import {send} from '../network/network.js';
import {now} from './time.js';
import {virtualRect} from './info.js';

export function errorLogger(channel, severity, args) {
  if (severity >= 0) {
    return;
  }

  const errorBits = {};
  if (args[0] instanceof Error) {
    errorBits.message = args[0].message;
    errorBits.stack = args[0].stack;
  }

  send('record-error', {
    ...args,
    ...errorBits,
    namespace: channel,
    timestamp: now(),
    client: virtualRect.serialize(),
    channel,
    severity,
  });
}
