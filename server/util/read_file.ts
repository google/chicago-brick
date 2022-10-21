import RJSON from "https://esm.sh/relaxed-json@1.0.3";

// Reads a file from disk and casts it to a specific type.
export async function readTextFile<T>(path: string): Promise<T> {
  const contents = await Deno.readTextFile(path);
  return RJSON.parse(contents) as T;
}
