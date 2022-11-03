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
import { walk } from "https://deno.land/std@0.132.0/fs/walk.ts";
import * as path from "https://deno.land/std@0.132.0/path/mod.ts";
import { flags } from "../../server/flags.ts";

const log = easyLog("slideshow:local");

// LOAD LOCAL FILES STRATEGY
// This loading strategy knows how to load both images and videos from the local file
// system, actually it's a proxy, but whatever.
// Config:
//   image: an object denoting references to images, containing sub-keys:
//     file: string - A local asset name (like 'cobra.ext'), which will get rewritten
//         to $ASSET_PATH/cobra.ext. The name must contain a file extension.
//     presplit: boolean - If true, assumes that the asset has been presplit by an
//         offline process into multiple files under a directory. A
//         file ending with, say cobra.webm, must have presplit files at
//         cobra/r${R}c${C}.webm.
//   video: an object denoting references to videos, containing sub-fields:
//     file: string - A local asset name (like 'cobra.ext'), which will get rewritten
//         to $ASSET_PATH/cobra.ext. The name must contain a file extension.
//     presplit: boolean - If true, assumes that the asset has been presplit by an
//         offline process into multiple files under a directory. A
//         file ending with, say cobra.webm, must have presplit files at
//         cobra/r${R}c${C}.webm.
//     sync: boolean - If true, keep the videos sync'd across their displays.
//     randomize_start: boolean - If true, pick a random time to start the videos.
//   Note: only 1 of image or video can be specified when using the presplit strategy.

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
  async parseConfig() {
    if (this.config.files) {
      this.paths.push(...this.config.files);
    }

    if (this.config.directories) {
      for (const dir of this.config.directories) {
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
        return {
          id: p,
        };
      }),
    };
  }
}
