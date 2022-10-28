// deno-lint-ignore no-explicit-any
export type Handler = (...payload: any[]) => void;
interface StoredHandler {
  origFn: Handler;
  handler: Handler;
}

export class EventEmitter {
  readonly handlers = new Map<string, StoredHandler[]>();
  on(type: string, fn: Handler) {
    this._addListener(type, fn, false);
  }
  once(type: string, fn: Handler) {
    this._addListener(type, fn, true);
  }
  removeListener(type: string, fn: Handler) {
    const handlers = this.handlers.get(type) || [];
    const newHandlers = handlers.filter((h) => h.origFn !== fn);
    if (newHandlers.length) {
      this.handlers.set(type, newHandlers);
    } else {
      this.handlers.delete(type);
    }
  }
  remoteAllListeners(type: string) {
    this.handlers.delete(type);
  }
  _addListener(type: string, fn: Handler, once: boolean) {
    const handlers = this.handlers.get(type) || [];
    if (once) {
      handlers.push({
        origFn: fn,
        handler: (...payload) => {
          fn(...payload);
          this.removeListener(type, fn);
        },
      });
    } else {
      handlers.push({ origFn: fn, handler: fn });
    }
    this.handlers.set(type, handlers);
  }
  emit(type: string, ...payload: unknown[]) {
    for (const { handler } of this.handlers.get(type) || []) {
      handler(...payload);
    }
  }
}
