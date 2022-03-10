import {easyLog} from '../../lib/log.js';
import * as network from './network.js';

const log = easyLog('wall:peer');

const knownPeers = new Map();

function relayMessage(msg, payload) {
  const {to} = payload;
  const toPeer = knownPeers.get(to);
  if (!toPeer) {
    log.error(`Unknown peer: ${to}`);
    return;
  }
  // Forward this along to the destination peer so it can connect.
  toPeer.socket.send(msg, payload);
}

export function initPeer() {
  network.on('connection', client => {
    client.on('peer-register', id => {
      // What do we need to store about a peer? Anything?
      knownPeers.set(id, {socket: client});

      client.send('peer-list', {
        knownPeers: [...knownPeers.keys()],
      });
    });
    client.on('peer-offer', data => relayMessage('peer-offer', data));
    client.on('peer-icecandidate', data => relayMessage('peer-icecandidate', data));
    client.on('peer-answer', data => relayMessage('peer-answer', data));
  });
  log('peer relay registered');
}
