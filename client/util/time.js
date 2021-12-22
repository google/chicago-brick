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

let lastServerTimeAtUpdate, lastClientTimeAtUpdate;

export function adjustTimeByReference(serverTime) {
  lastServerTimeAtUpdate = serverTime;
  lastClientTimeAtUpdate = performance.now();
}

export function now() {
  return performance.now() - lastClientTimeAtUpdate + lastServerTimeAtUpdate;
}
export function until(serverDeadline) {
  return Math.max(0, serverDeadline - now());
}
