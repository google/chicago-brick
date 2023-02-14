/* Copyright 2019 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

// Takes a function with specific named parameters and a sandbox with keys
// that match those parameters, then invokes the function with the mapped
// values of those keys.
export default function inject<R>(
  fn: (...args: unknown[]) => R,
  sandbox: Record<string, unknown>,
): R {
  const args = fn.toString()
    // Extract argument block between the first parentheses.
    .match(/\(([^)]*)/)![1]
    // Remove comments.
    .replaceAll(/\/\*[^]*\*\//mg, "")
    .replaceAll(/\/\/.*\n/g, "")
    // Collect valid argument names.
    .split(",")
    .map((arg) => arg.trim())
    .filter((arg) => arg)
    // Assign values from sandbox.
    .map((arg) => {
      if (!(arg in sandbox)) {
        console.warn(
          `inject error: unknown argument '${arg}', use one of: ${Object.keys(sandbox)}`,
        );
      }
      return sandbox[arg];
    });

  return fn.apply(null, args);
}
