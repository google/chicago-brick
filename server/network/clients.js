import network from './network.js';
import * as monitor from '../monitoring/monitor.js';
import * as time from '../util/time.js';
import EventEmitter from 'events';

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
    emitter.emit('new-client', client);
  });

  network.on('lost-client', function(id) {
    if (id in clients) {
      if (monitor.isEnabled()) {
        const rect = clients[id].rect;
        monitor.update({layout: {
          time: time.now(),
          event: `dropClient: ${rect.serialize()}`,
        }});
      }
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
