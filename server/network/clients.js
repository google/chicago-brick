import * as monitor from '../monitoring/monitor.js';
import * as time from '../util/time.js';
import Debug from 'debug';
import EventEmitter from 'events';
import network from './network.js';

const debug = Debug('wall:clients');

export const clients = {};
export const emitter = new EventEmitter();

export function init() {
  network.on('new-client', function(client) {
    if (monitor.isEnabled()) {
      monitor.update({layout: {
        time: time.now(),
        event: `newClient: ${client.rect.serialize()}`,
      }});
    }
    clients[client.socket.id] = client;
    debug(`New display: ${client.rect.serialize()}`);
    emitter.emit('new-client', client);
  });

  network.on('lost-client', function(id) {
    if (id in clients) {
      const {rect} = clients[id];
      if (monitor.isEnabled()) {
        monitor.update({layout: {
          time: time.now(),
          event: `dropClient: ${rect.serialize()}`,
        }});
      }
      debug(`Lost display: ${rect.serialize()}`);
      emitter.emit('lost-client', clients[id]);
    } else {
      if (monitor.isEnabled()) {
        monitor.update({layout: {
          time: time.now(),
          event: `dropClient: id ${id}`,
        }});
      }
    }
    delete clients[id];
  });
}
