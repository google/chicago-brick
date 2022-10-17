// A cache that knows the size of its values and tries to limit the stuff it has
// a pointer to.

export class SizeLimitedCache<K, V extends ArrayLike<unknown>>
  extends Map<K, V> {
  readonly maxSize: number;
  currentSize: number;
  constructor(size: number) {
    super();
    this.maxSize = size;
    this.currentSize = 0;
  }
  set(key: K, buffer: V) {
    this.delete(key);
    this.currentSize += buffer.length;
    this.evict();
    return super.set(key, buffer);
  }
  delete(key: K) {
    const buffer = this.get(key);
    if (buffer) {
      this.currentSize -= buffer.length;
      return super.delete(key);
    }
    return false;
  }
  evict() {
    // Don't evict _everything_, because we just added something!
    const iter = this.keys();
    while (this.currentSize > this.maxSize && this.size > 1) {
      // Amazingly, maps iterate in key-addition order, so we don't need to
      // track anything like LRU or whatever. We'll just toss the oldest thing
      // added.
      const firstIn = iter.next();
      this.delete(firstIn.value);
    }
  }
}
