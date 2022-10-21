let lastServerTimeAtUpdate = 0;
let lastClientTimeAtUpdate = 0;

/** Adjusts the local time based on some milestone from the server. */
export function adjustTimeByReference(serverTime: number) {
  lastServerTimeAtUpdate = serverTime;
  lastClientTimeAtUpdate = performance.now();
}

/** Returns the current server time. */
export function now(): number {
  return performance.now() - lastClientTimeAtUpdate + lastServerTimeAtUpdate;
}

/** Returns the time msDuration ms into the future. */
export function inFuture(msDuration: number): number {
  return now() + msDuration;
}

/**
 * Returns the time between now and some deadline in the future. If the
 * time is in the past, returns 0.
 */
export function until(serverDeadline: number): number {
  return Math.max(0, serverDeadline - now());
}
