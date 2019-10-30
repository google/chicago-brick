import {SizeLimitedCache} from './size_limited_cache.js';

const expect = chai.expect;

describe('SizeLimitedCache', () => {
  let cache;
  beforeEach(() => {
    cache = new SizeLimitedCache(10);
  });
  it('can store keys and values', () => {
    cache.set('a', 'xx');
    expect(cache.has('a')).to.equal(true);
    expect(cache.get('a')).to.equal('xx');
    cache.delete('a');
    expect(cache.has('a')).to.equal(false);
  });
  it('evicts when the cache gets too full', () => {
    cache.set('a', 'xx');
    cache.set('b', 'xxxxxxxx');
    expect(cache.has('a')).to.equal(true);
    expect(cache.has('b')).to.equal(true);
    cache.set('c', 'xx');
    expect(cache.has('a')).to.equal(false);
  });
});
