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
    .match(/\(([^)]*)/)![1]
    .split(",")
    .filter((arg) => arg)
    .map((arg) => arg.trim());
  return fn.apply(null, args.map((a) => sandbox[a]));
}
