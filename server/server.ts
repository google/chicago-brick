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
import { makeConsoleLogger } from "../lib/console_logger.js";
import { captureLog } from "./util/last_n_errors_logger.ts";
import { addLogger, easyLog } from "../lib/log.js";
import * as colors from "https://deno.land/std@0.123.0/fmt/colors.ts";
import { now } from "./util/time.ts";
import commandLineArgs from "https://esm.sh/command-line-args";
import commandLineUsage from "https://esm.sh/command-line-usage";
import { DispatchServer, DispatchServerOptions } from "./util/serving.ts";

addLogger(
  makeConsoleLogger(
    (c: string) =>
      (colors as unknown as Record<string, (str: string) => string>)[c],
    now,
  ),
);
addLogger(captureLog, "wall");

const log = easyLog("wall:server");

const FLAG_DEFS = [
  { name: "help", type: Boolean, description: "Shows this help." },
  {
    name: "port",
    type: Number,
    defaultValue: 3000,
    description: "The port on which the brick server should run.",
  },
  {
    name: "playlist",
    type: String,
    alias: "p",
    defaultValue: "config/demo-playlist.json",
    description: "The path to the playlist to run.",
  },
  {
    name: "layout_duration",
    type: Number,
    description: "The default layout duration in seconds.",
  },
  {
    name: "module_duration",
    type: Number,
    description: "The default module duration in seconds.",
  },
  {
    name: "assets_dir",
    type: String,
    alias: "d",
    // demo_modules contains the platform demos.
    // The modules dir should contain your own modules.
    defaultValue: ["demo_modules", "modules"],
    multiple: true,
    description: "List of directories of modules and assets.  Everything " +
      "under these dirs will be available under " +
      "/asset/(whatever is under your directories).",
  },
  {
    name: "module_dir",
    type: String,
    defaultValue: ["demo_modules/*", "node_modules/*"],
    multiple: true,
    description: "A glob pattern matching directories that contain module " +
      "code may be specified multiple times.",
  },
  {
    name: "use_geometry",
    type: JSON.parse,
    defaultValue: null,
    description:
      "When passed-in, describes the geometry of the wall via turtle-like commands. " +
      "See server/util/wall_geometry for the parser for the format.",
  },
  {
    name: "geometry_file",
    type: String,
    description: "The path to a JSON file describing the geometry of the wall.",
  },
  { name: "screen_width", type: Number, defaultValue: 1920 },
  {
    name: "credential_dir",
    type: String,
    description:
      "The path to a directory containing credentials needed by various modules that access external APIs.",
  },
  {
    name: "enable_monitoring",
    type: Boolean,
    description: "When true, enables a monitoring display on the client.",
  },
  {
    name: "https_cert",
    type: String,
    defaultValue: "",
    description: "Path to a SSL certification file. Often has extension crt.",
  },
  {
    name: "https_key",
    type: String,
    defaultValue: "",
    description: "Path to a SSL key file. Often has extension key.",
  },
  {
    name: "require_client_cert",
    type: Boolean,
    defaultValue: false,
    description: "Whether to require HTTPS certs from clients.",
  },
];
const flags = commandLineArgs(FLAG_DEFS);
if (flags.help) {
  console.log(
    "Available flags: " + commandLineUsage({ optionList: FLAG_DEFS }),
  );
  Deno.exit();
}
log("flags");
log(flags);

// Load credentials.
if (flags.credential_dir) {
  credentials.loadFromDir(flags.credential_dir);
}

// Initialize the wall geometry.
wallGeometry.init(flags);

// Load all of the module information we know about.
const moduleDefsByName = loadAllBrickJson(flags.module_dir);

// Load the playlist. If the playlist is malformed, we throw and abort.
const playlist = loadPlaylistFromFile(
  flags.playlist,
  moduleDefsByName,
  flags.layout_duration,
  flags.module_duration,
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
moduleServing.addRoutes(server, flags, moduleDefsByName);

// Add websocket routes to the server.
network.init(server);

// Initialize routes for peer connectivity.
peer.initPeer();

// Start the server with the routes installed.
server.start();

// Create a module player, which is the master control for telling the wall to do anything.
const modulePlayer = new ServerModulePlayer();

// Create a driver, which walks through a playlist one step at a time.
const driver = new PlaylistDriver(modulePlayer, moduleDefsByName);

// Optionally enable the monitoring mode, which shows debug and performance
// information on the client screens.
if (flags.enable_monitoring) {
  monitor.enable();
}

// Initialize a set of routes that communicate with the control server.
const control = new Control(driver, playlist, moduleDefsByName);
control.installHandlers();

// We are good to go: start the playlist!
log(`Loaded ${moduleDefsByName.size} modules`);
log("Running playlist of " + playlist.length + " layouts");
driver.start(playlist);
