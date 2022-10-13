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

export function assert(
  expr: unknown,
  ...rest: Array<string | number | undefined | null>
) {
  if (!expr) {
    try {
      throw new Error(`Assertion failure! ${rest.join(" ")}`);
    } catch (e) {
      console.error(e.stack);
      throw e;
    }
  }
}
