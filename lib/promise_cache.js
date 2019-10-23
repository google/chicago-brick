export class PromiseCache {
  constructor() {
    this.values = new Map;
    this.promises = new Map;
  }
  has(key) {
    return this.values.has(key);
  }
  hasAsync(key) {
    return this.promises.has(key);
  }
  get(key) {
    return this.values.get(key);
  }
  getAsync(key) {
    return this.promises.get(key);
  }
  set(key, promise) {
    this.promises.set(key, promise);
    promise.then(value => {
      this.values.set(key, value);
    });
  }
  delete(key) {
    this.values.delete(key);
    this.promises.delete(key);
  }
}
