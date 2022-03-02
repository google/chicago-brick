import {easyLog} from '../../lib/log.js';
import peer from 'peer';

const log = easyLog('wall:peer');

export function init(port) {
  const peerServer = new peer.PeerServer({port, path: '/peerjs'});
  peerServer.on('connection', function(id) {
    log.debugAt(1, 'peer connection!', id);
  });
  peerServer.on('disconnect', function(id) {
    log.debugAt(1, 'peer disconnect!', id);
  });
  log(`Started peer server on localhost:${port}/peerjs`);
}
