export class EventEmitter {
  constructor() {
    this.handlers = new Map();
  }
  on(type, fn) {
    this._addListener(type, fn, false);
  }
  once(type, fn) {
    this._addListener(type, fn, true);
  }
  removeListener(type, fn) {
    const handlers = this.handlers.get(type) || [];
    const newHandlers = handlers.filter(h => h.origFn !== fn);
    if (newHandlers.length) {
      this.handlers.set(type, newHandlers);
    } else {
      this.handlers.delete(type);
    }
  }
  _addListener(type, fn, once) {
    const handlers = this.handlers.get(type) || [];
    if (once) {
      handlers.push({origFn: fn, handler: (...payload) => {
        fn(...payload);
        this.removeListener(type, fn);
      }});
    } else {
      handlers.push({origFn: fn, handler: fn});
    }
    this.handlers.set(type, handlers);
  }
  emit(type, ...payload) {
    for (const {handler} of this.handlers.get(type) || []) {
      handler(...payload);
    }
  }
}