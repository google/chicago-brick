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

import { easyLog } from "../../lib/log.ts";
import { ContentPage, LocalLoadConfig } from "./interfaces.ts";
import { ServerLoadStrategy } from "./server_interfaces.ts";
import mime from "https://esm.sh/mime@3.0.0?no-dts";
import { walk } from "https://deno.land/std@0.166.0/fs/walk.ts";
import * as path from "https://deno.land/std@0.166.0/path/mod.ts";
import { flags } from "../../server/flags.ts";

const log = easyLog("slideshow:local");

interface LocalContentPaths {
  image?: string;
  video?: string;
}

interface Content extends Element {
  draw(time: number, delta: number): void;
}

async function exists(f: string) {
  try {
    await Deno.stat(f);
    return true;
  } catch {
    return false;
  }
}

export class LoadLocalServerStrategy implements ServerLoadStrategy {
  readonly paths: string[] = [];
  readonly configParsingComplete: Promise<void>;
  constructor(readonly config: LocalLoadConfig) {
    this.configParsingComplete = this.parseConfig();
  }
  getBytes(): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }

  async parseConfig() {
    if (this.config.files) {
      this.paths.push(...this.config.files);
    }

    if (this.config.directories) {
      for (const dir of this.config.directories) {
        if (this.config.clientOnly) {
          // These are client-only files. This means that we can't just look them up here on the server.
          // Instead, set the path to a dummy file in the directory with the right extension.
          this.paths.push(
            path.join(dir, `dummy${this.config.clientOnly.extension}`),
          );
          continue;
        }
        // Try to find the dir in the asset directories.
        let absDir = "";
        for (const assetDir of flags.assets_dir) {
          if (await exists(path.join(assetDir, dir))) {
            absDir = path.join(assetDir, dir);
          }
        }
        if (!absDir) {
          log.error(`Unable to find directory ${dir} in any asset directory!`);
        }
        for await (const entry of walk(absDir)) {
          if (entry.isDirectory) {
            continue;
          }
          const type: string = mime.getType(path.extname(entry.path));
          if (type.startsWith("image") || type.startsWith("video")) {
            const filePath = path.join(dir, path.relative(absDir, entry.path));
            log(`Found local asset: ${filePath} (type: ${type})`);
            this.paths.push(filePath);
          }
        }
      }
    }
  }
  async loadMoreContent(): Promise<ContentPage> {
    await this.configParsingComplete;
    return {
      contentIds: this.paths.map((p) => {
        return { id: p };
      }),
    };
  }
}
