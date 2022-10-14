/**
 * Wrap a socket with handlers for sending and receiving per-module messages.
 */

import {easyLog} from './log.ts';
const debug = easyLog('wall:lib:socket_wrapper');

// A map of module-id -> [message]
const earlyMessagesPerId = {};

// A map of module-id -> {messageName: (data, socket) -> void}
const messageHandlersPerId = {};

// Make a variable that lazily initializes. The resulting value must be truthy.
function lazyInit(init) {
  let i;
  return () => (i || (i = init()));
}

/**
 * Remove every element of arr for which fn returns true, and returns an array
 * of those removed elements.
 */
function removeIf(arr, fn) {
  const indicesToRemove = [];
  const ret = arr.filter((m, i) => {
    if (fn(m)) {
      indicesToRemove.push(i);
      return true;
    }
    return false;
  });
  indicesToRemove.reverse();
  indicesToRemove.forEach(i => arr.splice(i, 1));
  return ret;
}

/**
 * Deliver a message to handlers.
 * Messages are sent via the wrapper and so are always of the same form:
 * {
 *   id: The unique module identifier.
 *   name: The original name of the message the module sent.
 *   payload: The payload of the original message.
 * }
 * The socket is the unwrapped socket that received this message.
 */
function deliverMessage(data, socket) {
  const {id, name, payload} = data;
  const wrappedSocket = lazyInit(() => makeModuleOverlaySocket(id, socket));
  if (id in messageHandlersPerId) {
    const messageHandlers = messageHandlersPerId[id];
    if (name in messageHandlers) {
      // We have a handler registered for this message. Invoke it. Note that
      // these handlers are expected to run in module-land, we send along a
      // wrapped socket.
      //debug(`received ${name} ${id}`);
      messageHandlers[name](payload, wrappedSocket());
    } else {
      // We don't have a handler for this message. We could drop it, but it's
      // quite possible that the handler just hasn't yet been registered.
      // Instead, we'll retain it for when that handler gets registered. If it
      // never shows up, that's a big waste of memory, but it will eventually
      // get cleaned up when the module is finished.
      //debug(`cached ${name} ${id}`);
      earlyMessagesPerId[id].push({data, socket});
    }
  } else {
    // We received a message for a module we don't know about.
    // If we hang onto this message, and we never learn about this module,
    // we'll never clean it up, so we are forced to drop it.
    debug(`Received a message for unknown module id: ${id}`);
  }
}

/**
 * Installs the message handler to a socket.
 * This should be invoked on the "framework-level" sockets; those which don't
 * close, but stay open between the client & server for the whole operation of
 * the binary. As a result, it doesn't need to get cleaned up.
 */
export function installModuleOverlayHandler(socket) {
  socket.on('module-message', d => deliverMessage(d, socket));
}

/**
 * Creates a facade over a socket that emulates the socket.io API.
 * This is the most complex part of the wrapper.
 */
export function makeModuleOverlaySocket(id, socket, additionalMethods = {}) {
  // Initialize our per-module stores.
  messageHandlersPerId[id] = messageHandlersPerId[id] || {};
  earlyMessagesPerId[id] = earlyMessagesPerId[id] || [];

  // Returns an API suitable to pass into module code. It emulates the socket.io
  // API but wraps it to ensure that modules cannot talk to other modules (or
  // even other instances of the same module).
  return {
    // Emits a message via the wrapped socket.
    emit(messageName, payload) {
      //debug(`sent ${messageName} ${socket.id}`);
      socket.emit('module-message', {
        id,
        name: messageName,
        payload
      });
    },
    // Adds a listener for the named message, which will invoke the cb when
    // it arrives on the wrapped socket. If once is true, the cb will be
    // unregistered after it is invoked.
    on(messageName, cb, once = false) {
      const actualCb = !once ? cb : (...args) => {
        // Invoke the callback...
        cb(...args);
        // And then pretend that I've never registered in the first place.
        delete messageHandlersPerId[id][messageName];
      };
      // Add the handler to our list of handlers for this module.
      messageHandlersPerId[id][messageName] = actualCb;
      // If there are messages that arrived on this module already, invoke them.
      const earlyMessages = earlyMessagesPerId[id];
      if (earlyMessages) {
        const messagesToDeliver = removeIf(earlyMessages, m => m.data.name == messageName);
        messagesToDeliver.forEach(({data, socket}) => deliverMessage(data, socket));
      }
    },
    once(messageName, cb) {
      this.on(messageName, cb, true);
    },
    // Add arbitrary additional methods/properties to the API.
    ...additionalMethods,
  };
}

export function cleanupModuleOverlayHandler(id) {
  delete messageHandlersPerId[id];
  delete earlyMessagesPerId[id];
}
