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
  set(key, value) {
    this.promises.set(key, Promise.resolve(value));
    this.values.set(key, value);
  }
  setAsync(key, promise) {
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
