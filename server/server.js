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

'use strict';

import * as credentials from './util/credentials.js';
import * as game from './game/game.js';
import * as moduleServing from './modules/serving.js';
import * as monitor from './monitoring/monitor.js';
import * as network from './network/network.js';
import * as peer from './network/peer.js';
import * as wallGeometry from './util/wall_geometry.js';
import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import fs from 'fs';
import https from 'https';
import path from 'path';
import {Control} from './control.js';
import {ServerModulePlayer} from './modules/server_module_player.js';
import {PlaylistDriver} from './playlist/playlist_driver.js';
import {loadAllBrickJson, loadPlaylistFromFile} from './playlist/playlist_loader.js';
import {makeConsoleLogger} from '../lib/console_logger.js';
import {captureLog} from './util/last_n_errors_logger.js';
import {addLogger, easyLog} from '../lib/log.js';
import chalk from 'chalk';
import {now} from './util/time.js';

function makeServer(app, options = {port: 3000, useHttps: false, requireClientCert: false}) {
  const listener = function() {
    const host = server.address().address;
    const port = server.address().port;

    log(`Server listening at http://${host}:${port}`);
  };

  if (options.useHttps) {
    const opts = {
      key: fs.readFileSync('certs/server_key.pem'),
      cert: fs.readFileSync('certs/server_cert.pem'),
      requestCert: options.requireClientCert,
      ca: [fs.readFileSync('certs/server_cert.pem')]
    };

    return https.createServer(opts, app).listen(options.port, listener);
  } else {
    return app.listen(options.port, listener);
  }
}

addLogger(makeConsoleLogger(c => chalk.keyword(c), now));
addLogger(captureLog, 'wall');

const log = easyLog('wall:server');

const FLAG_DEFS = [
  {name: 'node_modules_dir', type: String,
      defaultValue: path.join(process.cwd(), '..', 'node_modules'),
      description: 'If you are running a chicago-brick instance where ' +
          'chicago-brick is a dep and lives in node_modules, you must set ' +
          'this to your project\'s node_modules dir or the /sys path will ' +
          'be set to a nonexistent directory.'},
  {name: 'playlist', type: String, alias: 'p',
      defaultValue: 'config/demo-playlist.json'},
  {name: 'assets_dir', type: String, alias: 'd',
      // demo_modules contains the platform demos.
      // The modules dir should contain your own modules.
      defaultValue: ['demo_modules', 'modules'], multiple: true,
      description: 'List of directories of modules and assets.  Everything ' +
          'under these dirs will be available under ' +
          '/asset/(whatever is under your directories).'},
  {name: 'module_dir', type: String,
      defaultValue: ['demo_modules/*', 'node_modules/*'], multiple: true,
      description: 'A glob pattern matching directories that contain module ' +
          'code may be specified multiple times.'},
  {name: 'help', type: Boolean},
  {name: 'port', type: Number, defaultValue: 3000},
  {name: 'use_geometry', type: JSON.parse, defaultValue: null},
  {name: 'screen_width', type: Number, defaultValue: 1920},
  {name: 'layout_duration', type: Number},
  {name: 'module_duration', type: Number},
  {name: 'game_server_host', type: String, defaultValue: ''},
  {name: 'geometry_file', type: String},
  {name: 'credential_dir', type: String},
  {name: 'enable_monitoring', type: Boolean},
  {name: 'use_https', type: Boolean, defaultValue: false,
    description: 'Enables HTTPS. Certificates must exist in certs/.'},
  {name: 'require_client_cert', type: Boolean, defaultValue: false,
    description: 'Whether to require HTTPS certs from clients.'}
];
const flags = commandLineArgs(FLAG_DEFS);
if (flags.help) {
  console.log('Available flags: ' + commandLineUsage({optionList: FLAG_DEFS}));
  process.exit();
}
log('flags')
log(flags);

// Install a top-level rejection handler so that such rejections will not cause the
// server to abort.
process.on('unhandledRejection', (reason, p) => {
  log.error('Unhandled rejection: ', p);
  log.error(reason);
});

// Load credentials.
if (flags.credential_dir) {
  credentials.loadFromDir(flags.credential_dir);
}

// Initialize the wall geometry.
wallGeometry.init(flags);

// Initialize our game library.
game.init(flags);

// Initialize peerjs. We pick a different port for the peerjs server.
peer.init(flags.port + 6000);

// Load all of the module information we know about.
const moduleDefsByName = loadAllBrickJson(flags.module_dir);

// Load the playlist. If the playlist is malformed, we throw and abort.
const playlist = loadPlaylistFromFile(flags.playlist, moduleDefsByName, flags.layout_duration, flags.module_duration);

// Create an expressjs that can describes the routes that serve the files the client
// needs to run.
const app = moduleServing.create(flags);

// Create a server that handles those routes.
const server = makeServer(app, {
  port: flags.port,
  useHttps: flags.use_https,
  requireClientCert: flags.require_client_cert,
});

// Initialize the server side of our communications layer with the clients.
network.init(server);

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
log('Running playlist of ' + playlist.length + ' layouts');
driver.start(playlist);
