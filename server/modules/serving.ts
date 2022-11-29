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
import * as path from "https://deno.land/std@0.166.0/path/mod.ts";
import {
  DispatchServer,
  notFound,
  serveDirectory,
  serveFile,
} from "../util/serving.ts";
import { library } from "./library.ts";
import { flags } from "../flags.ts";
import { tempDirectories } from "../util/temp_directory.ts";

const log = easyLog("wall:serving");

function exists(str: string) {
  try {
    Deno.statSync(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates the main ExpressJS web app.
 */
export function addRoutes(
  server: DispatchServer,
) {
  // The location we are running from.
  const cwd = Deno.cwd();

  // But we really want to get the path to the brick folder.
  const brickPath = exists(path.join(cwd, "node_modules/chicago-brick"))
    ? path.join(cwd, "node_modules/chicago-brick")
    : cwd;

  log(`CWD: ${cwd}`);
  log(`Brick directory: ${brickPath}`);

  // Create routes just for the brick files that could be served to the client.
  // These are:
  //   /client => node_modules/brick/client
  //   /lib => node_modules/brick/lib
  server.addHandler("/client/:path*", serveDirectory(path.join(cwd, "client")));
  server.addHandler("/lib/:path*", serveDirectory(path.join(cwd, "lib")));

  server.addHandler("/{asset/}?tmp/:name/:path*", async (req, match) => {
    // Find a temp directory with the same name
    const foundDir = [...tempDirectories.values()].find((t) => {
      return t.includes(match.pathname.groups.name);
    });
    if (foundDir) {
      return await serveDirectory(foundDir)(req, match);
    } else {
      return notFound();
    }
  });

  // We support a global set of asset directories.
  for (const assets_dir of flags.assets_dir) {
    server.addHandler("/asset/:path*", serveDirectory(assets_dir));
  }

  // We also support per-module routing.
  server.addHandler("/module/:name/:path*", async (req, match) => {
    if (library.has(match.pathname.groups.name)) {
      const def = library.get(match.pathname.groups.name)!;
      const res = await serveDirectory(def.root)(req, match);
      res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.headers.set("Pragma", "no-cache");
      res.headers.set("Expires", "0");
      return res;
    } else {
      return notFound();
    }
  });

  server.addHandler(
    "/favicon.ico",
    serveFile(path.join(brickPath, "client/favicon.ico")),
  );
  server.addHandler("/", serveFile(path.join(brickPath, "client/index.html")));
}
