import chai from "https://cdn.skypack.dev/chai@4.3.4?dts";
import {
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.166.0/testing/bdd.ts";
import { SizeLimitedCache } from "./size_limited_cache.ts";

const expect = chai.expect;

describe("SizeLimitedCache", () => {
  let cache: SizeLimitedCache<string, { size: number }>;
  beforeEach(() => {
    cache = new SizeLimitedCache(10);
  });
  it("can store keys and values", () => {
    cache.set("a", { size: 2 });
    expect(cache.has("a")).to.equal(true);
    expect(cache.get("a")!.size).to.equal(2);
    cache.delete("a");
    expect(cache.has("a")).to.equal(false);
  });
  it("evicts when the cache gets too full", () => {
    cache.set("a", { size: 2 });
    cache.set("b", { size: 8 });
    expect(cache.has("a")).to.equal(true);
    expect(cache.has("b")).to.equal(true);
    cache.set("c", { size: 2 });
    expect(cache.has("a")).to.equal(false);
  });
});
