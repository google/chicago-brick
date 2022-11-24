import { easyLog } from "./log.ts";
import { delay } from "./promise.ts";

const log = easyLog("wall:rate_limit");

type RateLimitedFn<T> = () => Promise<T>;

export async function rateLimit<T>(
  fn: RateLimitedFn<T>,
  // If we return a new rate limited fn, then keep going. Otherwise, we are giving up.
  retryStrategy: (
    e: Error,
    signal: AbortSignal,
  ) => Promise<RateLimitedFn<T> | undefined>,
  abortSignal: AbortSignal,
): Promise<T> {
  const tryIt: (fn: RateLimitedFn<T>) => Promise<T> = async () => {
    try {
      return await fn();
      // We are good!
    } catch (e) {
      // Hmm. Didn't work! Ask the retry strategy what to do.
      const newFn = await retryStrategy(e, abortSignal);
      if (newFn) {
        // Loop back.. keep trying!
        return await tryIt(newFn);
      }
      // Retry didn't want to retry anymore.
      throw new Error("Retries exhausted");
    }
  };
  return await tryIt(fn);
}

export function exponential() {
  let backoffMs = Math.random() * 500 + 500;
  return () => {
    const ret = backoffMs;
    backoffMs *= 2;
    backoffMs += Math.random();
    backoffMs = Math.min(5000, backoffMs);
    return ret;
  };
}

export function rateLimit403Responses(
  fetch: () => Promise<Response>,
  abortSignal: AbortSignal,
  retryCount = 5,
) {
  const retry = exponential();
  return rateLimit(async () => {
    const res = await fetch();
    if (!res.ok) {
      if (res.status === 403) {
        log(`Retrying operationw with 403 return code.`);
        // 403 error! Try again.
        throw new Error("Please continue");
      }
    }
    return res;
  }, async (err, abortSignal) => {
    retryCount--;
    if (retryCount <= 0 || abortSignal.aborted) {
      // No retries left!
      throw err;
    }
    if (err.message === "Please continue") {
      log(`Retrying operation ${retryCount} tries left`);
      // I'm going to handle this. Wait some time.
      await delay(retry());
      // Now try again with the same fetch operation.
      return fetch;
    }
    throw err;
  }, abortSignal);
}
