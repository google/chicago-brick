// A cache that knows the size of its values and tries to limit the stuff it has
// a pointer to.

export class SizeLimitedCache extends Map {
  constructor(size) {
    super();
    this.maxSize = size;
    this.currentSize = 0;
  }
  set(key, buffer) {
    this.delete(key);
    this.currentSize += buffer.length;
    this.evict();
    super.set(key, buffer);
  }
  delete(key) {
    const buffer = this.get(key);
    if (buffer) {
      this.currentSize -= buffer.length;
      super.delete(key);
    }
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
