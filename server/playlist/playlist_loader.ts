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

import { assert } from "../../lib/assert.ts";
import { Layout } from "../modules/layout.ts";
import { easyLog } from "../../lib/log.ts";
import * as path from "https://deno.land/std@0.132.0/path/mod.ts";
import { walk } from "https://deno.land/std@0.132.0/fs/walk.ts";
import { ModuleDef } from "../modules/module_def.ts";
import { readTextFile } from "../util/read_file.ts";

const log = easyLog("wall:playlist_loader");

interface CreditAuthorTitleJson {
  title: string;
  author?: string;
}

interface CreditImageJson {
  image: string;
}

type CreditJson = CreditAuthorTitleJson | CreditImageJson;

interface BrickJson {
  name: string;
  extends?: string;
  client_path: string;
  server_path?: string;
  credit: CreditJson;
  config?: Record<string, unknown>;
  testonly: boolean;
}

interface ModuleConfig extends BrickJson {
  root: string;
}

interface LayoutConfig {
  modules?: string[];
  collection?: "__ALL__" | string;
  moduleDuration: number;
  duration: number;
}

interface PlaylistJson {
  collections?: Record<string, string[]>;
  modules?: BrickJson[];
  playlist: LayoutConfig[];
}

/**
 * Looks through the moduleDirs for brick.json files.
 * Returns a map of module name => module def.
 */
export async function loadAllBrickJson(
  moduleDirs: string[],
): Promise<Map<string, ModuleDef>> {
  // Try to find all of the modules on disk. We scan them all in order to
  // figure out the whole universe of modules. We have to do this, because
  // if we are told to play a module by name, we don't know which path to
  // load or whatever config to use.
  const allConfigs: ModuleConfig[] = [];
  for (const dir of moduleDirs) {
    for await (
      const brickEntry of walk(".", {
        match: [path.globToRegExp(path.join(dir, "brick.json"))],
      })
    ) {
      let brickJson;
      try {
        brickJson = await readTextFile<BrickJson | BrickJson[]>(
          brickEntry.path,
        );
      } catch (e) {
        log.error(e);
        log.error(`Skipping invalid config in: ${brickEntry.path}`);
        continue;
      }

      const root = path.dirname(brickEntry.path);

      if (Array.isArray(brickJson)) {
        for (const brick of brickJson) {
          allConfigs.push({
            ...brick,
            root,
          });
        }
      } else {
        allConfigs.push({
          ...brickJson,
          root,
        });
      }
    }
  }

  return loadAllModules(allConfigs);
}

/**
 * Turns module configs into module defs. Returns a map of name => def.
 */
export function loadAllModules(
  configs: ModuleConfig[],
  defsByName = new Map<string, ModuleDef>(),
): Map<string, ModuleDef> {
  for (const config of configs.filter((c) => !c.extends)) {
    // This is a "base" module. Make a moduleDef.
    defsByName.set(
      config.name,
      new ModuleDef(
        config.name,
        config.root,
        {
          server: config.server_path ?? "",
          client: config.client_path ?? "",
        },
        "",
        config.config ?? {},
        config.credit || {},
        !!config.testonly,
      ),
    );
  }

  for (const config of configs.filter((c) => c.extends)) {
    // This is an extension module, so we need to combine some things to make a module def.
    const base = defsByName.get(config.extends!);
    if (!base) {
      log.error(
        `Module ${config.name} attempted to extend module ${config.extends}, which cannot be found.`,
      );
      continue;
    }
    defsByName.set(
      config.name,
      new ModuleDef(
        config.name,
        base.root,
        {
          server: base.serverPath,
          client: base.clientPath,
        },
        base.name,
        { ...base.config, ...config.config ?? [] },
        config.credit || {},
        !!config.testonly,
      ),
    );
  }
  return defsByName;
}

/**
 * Loads a playlist from a file and turns it into a list of Layout objects.
 */
export async function loadPlaylistFromFile(
  path: string,
  defsByName: Map<string, ModuleDef>,
  overrideLayoutDuration: number,
  overrideModuleDuration: number,
): Promise<Layout[]> {
  const contents = await readTextFile<PlaylistJson>(path);

  let { collections, playlist, modules } = contents;
  if (playlist.length === 0) {
    throw new Error(`No Layouts specified in playlist: ${path}!`);
  }

  collections = collections ?? {};

  if (modules) {
    for (const module of modules) {
      if (!module.extends) {
        throw new Error(
          `Module ${module.name} defined in playlist ${path} must extend some existing module`,
        );
      }
    }
    loadAllModules(modules as ModuleConfig[], defsByName);
  }

  const layouts: Layout[] = [];
  for (const layoutJson of playlist) {
    const { collection, modules } = layoutJson;

    let moduleNames;
    if (collection) {
      if (collection == "__ALL__") {
        moduleNames = [...defsByName.values()].map((d) => d.name);
      } else {
        assert(
          collections[collection],
          `Unknown collection name: ${collection}`,
        );
        moduleNames = [...collections[collection]];
      }
    } else {
      assert(modules, "Missing modules list in layout def!");
      moduleNames = [...modules!];
    }

    layouts.push(
      new Layout({
        modules: moduleNames,
        moduleDuration: overrideModuleDuration || layoutJson.moduleDuration,
        duration: overrideLayoutDuration || layoutJson.duration,
      }),
    );
  }
  return layouts;
}
