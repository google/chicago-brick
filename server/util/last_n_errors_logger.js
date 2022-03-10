import * as network from '../network/network.js';

network.on('connection', socket => {
  socket.on('record-error', err => {
    addToBuffer(err);
  });
});

const buffer = [];
function addToBuffer(item) {
  buffer.push(item);
  if (buffer.length > 100) {
    buffer.shift();
  }
}

export function getErrors() {
  return buffer;
}

export function captureLog(channel, severity, args) {
  if (severity < 0) {
    addToBuffer({
      channel,
      severity,
      ...args,
    });
  }
}
