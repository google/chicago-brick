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

"use strict";

import * as credentials from "./util/credentials.ts";
import * as moduleServing from "./modules/serving.ts";
import * as monitor from "./monitoring/monitor.ts";
import * as network from "./network/network.ts";
import * as peer from "./network/peer.ts";
import * as wallGeometry from "./util/wall_geometry.ts";
import { Control } from "./control.ts";
import { ServerModulePlayer } from "./modules/server_module_player.ts";
import { PlaylistDriver } from "./playlist/playlist_driver.ts";
import {
  loadAllBrickJson,
  loadPlaylistFromFile,
} from "./playlist/playlist_loader.ts";
import {
  isStringWithOptions,
  makeConsoleLogger,
  StringWithOptions,
} from "../lib/console_logger.ts";
import { captureLog } from "./util/last_n_errors_logger.ts";
import { addLogger, easyLog } from "../lib/log.ts";
import * as colors from "https://deno.land/std@0.123.0/fmt/colors.ts";
import * as time from "../lib/adjustable_time.ts";
import { DispatchServer, DispatchServerOptions } from "./util/serving.ts";
import { library } from "./modules/library.ts";
import { flags } from "./flags.ts";

addLogger(
  makeConsoleLogger(
    (...strings: (string | StringWithOptions)[]) => {
      const coloredStrings: string[] = [];

      const COLOR_TO_FG_FN: Record<string, (s: string) => string> = {
        "black": colors.black,
        "red": colors.red,
        "green": colors.green,
        "blue": colors.blue,
        "yellow": colors.yellow,
        "orange": (s) => colors.rgb8(s, 202),
        "purple": (s) => colors.rgb8(s, 5),
        "cyan": colors.cyan,
        "magenta": colors.magenta,
        "gray": colors.gray,
      };
      const COLOR_TO_BG_FN: Record<string, (s: string) => string> = {
        "black": colors.bgBlack,
        "red": colors.bgRed,
        "green": colors.bgGreen,
        "blue": colors.bgBlue,
        "yellow": colors.bgYellow,
        "orange": (s) => colors.bgRgb8(s, 202),
        "purple": (s) => colors.bgRgb8(s, 5),
        "cyan": colors.bgCyan,
        "magenta": colors.bgMagenta,
        "gray": (s) => colors.bgRgb8(s, 8),
      };

      for (const str of strings) {
        if (isStringWithOptions(str)) {
          let newStr = str.str;
          if (str.options.bold) {
            newStr = colors.bold(newStr);
          }
          if (str.options.backgroundColor) {
            const bgFn = COLOR_TO_BG_FN[str.options.backgroundColor];
            if (bgFn) {
              newStr = bgFn(newStr);
            }
          }
          const fbFn = COLOR_TO_FG_FN[str.options.color];
          if (fbFn) {
            newStr = fbFn(newStr);
          }
          coloredStrings.push(newStr);
        } else {
          coloredStrings.push(str);
        }
      }
      console.log(coloredStrings.join(""));
    },
    time.now,
  ),
);
addLogger(captureLog, "wall");

const log = easyLog("wall:server");

// Load credentials.
if (flags.credential_dir) {
  credentials.loadFromDir(flags.credential_dir);
}

// Initialize the wall geometry.
wallGeometry.init();

// Load all of the module information we know about.
await loadAllBrickJson(flags.module_dir);

// Load the playlist. If the playlist is malformed, we throw and abort.
const playlist = await loadPlaylistFromFile(
  flags.playlist,
  flags.layout_duration || 0,
  flags.module_duration || 0,
);

// Create an serve that can describes the routes that serve the files the client
// needs to run.
const options: DispatchServerOptions = { port: flags.port };
if (flags.https_cert) {
  options.ssl = {
    certFile: flags.https_cert,
    keyFile: flags.https_key,
  };
}
const server = new DispatchServer(options);

// Add module serving routes to the server.
moduleServing.addRoutes(server);

// Add websocket routes to the server.
network.init(server);

// Initialize routes for peer connectivity.
peer.initPeer();

// Create a module player, which is the master control for telling the wall to do anything.
const modulePlayer = new ServerModulePlayer();

// Create a driver, which walks through a playlist one step at a time.
const driver = new PlaylistDriver(modulePlayer);

// Optionally enable the monitoring mode, which shows debug and performance
// information on the client screens.
if (flags.enable_monitoring) {
  monitor.enable();
}

// Initialize a set of routes that communicate with the control server.
const control = new Control(driver, playlist);
control.installHandlers(server);

// Start the server with the routes installed.
server.start();

// We are good to go: start the playlist!
log(`Loaded ${library.size} modules`);
log("Running playlist of " + playlist.length + " layouts");
driver.start(playlist);
