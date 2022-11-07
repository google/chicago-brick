export const tempDirectories = new Map<string, string>();

export function existingTempDir(key: string) {
  return tempDirectories.get(key);
}

export async function makeTempDir(key: string) {
  const existing = tempDirectories.get(key);
  if (existing) {
    return existing;
  }
  const temp = await Deno.makeTempDir({ prefix: "chicago-brick" });
  tempDirectories.set(key, temp);
  return temp;
}
