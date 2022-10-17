export class PromiseCache<Key, Value> {
  readonly values = new Map<Key, Value>();
  readonly promises = new Map<Key, Promise<Value>>();

  has(key: Key): boolean {
    return this.values.has(key);
  }
  hasAsync(key: Key): boolean {
    return this.promises.has(key);
  }
  get(key: Key): Value | undefined {
    return this.values.get(key);
  }
  getAsync(key: Key): Promise<Value> | undefined {
    return this.promises.get(key);
  }
  set(key: Key, value: Value) {
    this.promises.set(key, Promise.resolve(value));
    this.values.set(key, value);
  }
  setAsync(key: Key, promise: Promise<Value>) {
    this.promises.set(key, promise);
    promise.then((value) => {
      this.values.set(key, value);
    });
  }
  delete(key: Key) {
    this.values.delete(key);
    this.promises.delete(key);
  }
}
