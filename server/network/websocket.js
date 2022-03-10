import {WebSocketServer} from 'ws';
import {EventEmitter} from 'events';
import {WS} from '../../lib/websocket.js';
import {easyLog} from '../../lib/log.js';

const log = easyLog('wall:websocket');

export class WSS extends EventEmitter {
  constructor(options) {
    super();
    this.webSocketServer = new WebSocketServer(options);
    this.clientSockets = new Set();
    this.webSocketServer.on('listening', () => {
      log('WSS server listening on', this.webSocketServer.address());
    });
    this.webSocketServer.on('connection', websocket => {
      const ws = WS.serverWrapper(websocket);
      this.clientSockets.add(ws);
      ws.on('disconnect', (code, reason) => {
        log.error(`Lost client: ${code} Reason: ${reason}`);
        this.clientSockets.delete(ws);
        this.emit('disconnect', ws);
      });
      this.emit('connection', ws);
    });
  }
  sendToAllClients(msg, payload) {
    for (const websocket of this.clientSockets) {
      websocket.send(msg, payload);
    }
  }
}
