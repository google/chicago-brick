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

import * as path from "https://deno.land/std@0.166.0/path/mod.ts";
import { easyLog } from "../../lib/log.ts";

const log = easyLog("wall:credentials");

const creds: Record<string, unknown> = {};

export function get(name: string) {
  return creds[name];
}

// Loads every .json file in the specified dir. Credentials are stored under
// the key related to the filename.
export function loadFromDir(dir: string) {
  for (
    const p of [...Deno.readDirSync(dir)].filter((p) =>
      p.name.endsWith(".json")
    )
  ) {
    const contents = Deno.readFileSync(path.join(dir, p.name));
    const decoder = new TextDecoder();
    const cred = JSON.parse(decoder.decode(contents));
    creds[p.name.replace(".json", "")] = cred;
  }
  log(`Loaded credentials:`, Object.keys(creds).join(", "));
}
