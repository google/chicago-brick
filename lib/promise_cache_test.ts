import chai from "https://cdn.skypack.dev/chai@4.3.4?dts";
import {
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.166.0/testing/bdd.ts";
import { PromiseCache } from "./promise_cache.ts";

const expect = chai.expect;

function someAsyncWork() {
  let resolve: (value: unknown) => void;
  const promise = new Promise((r) => resolve = r);
  return { promise, resolve: resolve! };
}

describe("PromiseCache", () => {
  let cache: PromiseCache<string, unknown>;
  beforeEach(() => {
    cache = new PromiseCache();
  });

  it("can handle a reasonable promise chain", async () => {
    expect(cache.has("work")).to.equal(false);
    expect(cache.hasAsync("work")).to.equal(false);
    expect(cache.get("work")).to.equal(undefined);
    expect(cache.getAsync("work")).to.equal(undefined);

    const { promise, resolve } = someAsyncWork();
    cache.setAsync("work", promise);
    expect(cache.has("work")).to.equal(false);
    expect(cache.hasAsync("work")).to.equal(true);
    expect(cache.get("work")).to.equal(undefined);
    expect(cache.getAsync("work")).to.equal(promise);

    resolve("result");

    expect(cache.has("work")).to.equal(false);
    expect(cache.hasAsync("work")).to.equal(true);
    expect(cache.get("work")).to.equal(undefined);
    expect(cache.getAsync("work")).to.equal(promise);
    await promise;

    expect(cache.has("work")).to.equal(true);
    expect(cache.hasAsync("work")).to.equal(true);
    expect(cache.get("work")).to.equal("result");
    expect(await cache.getAsync("work")).to.equal("result");
    cache.delete("work");

    expect(cache.has("work")).to.equal(false);
    expect(cache.hasAsync("work")).to.equal(false);
    expect(cache.get("work")).to.equal(undefined);
    expect(cache.getAsync("work")).to.equal(undefined);
  });

  it("joins on multiple async gets", async () => {
    const { promise, resolve } = someAsyncWork();
    cache.setAsync("work", promise);

    const get1 = cache.getAsync("work");
    const get2 = cache.getAsync("work");

    resolve("done");
    const val1 = await get1;
    const val2 = await get2;
    expect(val1).to.equal("done");
    expect(val2).to.equal("done");
  });
});
