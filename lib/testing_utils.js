export async function willReject(fn) {
  try {
    await fn();
  } catch (e) {
    return;
  }
  throw new Error('Should have rejected!');
}

export async function isPending(p) {
  return 'pending' == await Promise.race([p, 'pending']);
}
