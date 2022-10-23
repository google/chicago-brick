export async function willReject(fn: () => Promise<void>) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error("Should have rejected!");
}

export async function isPending<T>(p: Promise<T>) {
  return "pending" == await Promise.race([p, "pending"]);
}
