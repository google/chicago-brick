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
import { makeConsoleLogger } from "../lib/console_logger.ts";
import { captureLog } from "./util/last_n_errors_logger.ts";
import { addLogger, easyLog } from "../lib/log.ts";
import * as time from "../lib/adjustable_time.ts";
import { library } from "./modules/library.ts";
import { flags } from "./flags.ts";
import { consoleLogger } from "./util/console_logger.ts";
import { startSchedule } from "./playlist/calendar_playlist.ts";

addLogger(makeConsoleLogger(consoleLogger, time.now));
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
  flags.module,
  flags.layout_duration || 0,
  flags.module_duration || 0,
);

// Add module serving routes to the server.
moduleServing.addRoutes(network.server);

// Initialize routes for peer connectivity.
peer.initPeer();

// Create a module player, which is the master control for telling the wall to do anything.
const modulePlayer = new ServerModulePlayer();

// Create a driver, which walks through a playlist one step at a time.
const driver = new PlaylistDriver(modulePlayer, playlist);

// Optionally enable the monitoring mode, which shows debug and performance
// information on the client screens.
if (flags.enable_monitoring) {
  monitor.enable();
}

// Initialize a set of routes that communicate with the control server.
const control = new Control(driver);
control.installHandlers(network.server);

// Start the server with the routes installed.
network.server.start();

// We are good to go: start the playlist!
log(`Loaded ${library.size} modules`);
log("Running playlist of " + playlist.length + " layouts");
driver.start(playlist);

if (flags.calendar_id) {
  log(`Starting events for calendar: ${flags.calendar_id}`);
  await startSchedule(
    flags.calendar_id,
    "googleserviceaccountkey",
    driver,
  );
}
