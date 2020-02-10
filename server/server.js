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
import * as network from './network/network.js';
import * as wallGeometry from './util/wall_geometry.js';
import * as moduleServing from './modules/serving.js';
import {tellClientToPlay} from './modules/module.js';
import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import fs from 'fs';
import https from 'https';
import path from 'path';
import {Control} from './control.js';
import {RunningModule} from './modules/module.js';
import {ServerModulePlayer} from './modules/server_module_player.js';
import peer from 'peer';
import {makeConsoleLogger} from '../lib/console_logger.js';
import {captureLog} from './util/last_n_errors_logger.js';
import {addLogger, easyLog} from '../lib/log.js';
import chalk from 'chalk';
import {now} from './util/time.js';

addLogger(makeConsoleLogger(c => chalk.keyword(c), now));
addLogger(captureLog, 'wall');

const log = easyLog('wall:server');

const {PeerServer} = peer;

const FLAG_DEFS = [
  {name: 'node_modules_dir', type: String,
      defaultValue: path.join(process.cwd(), '..', 'node_modules'),
      description: 'If you are running a chicago-brick instance where ' +
          'chicago-brick is a dep and lives in node_modules, you must set ' +
          'this to your project\'s node_modules dir or the /sys path will ' +
          'be set to a nonexistent directory.'},
  {name: 'assets_dir', type: String, alias: 'd',
      // demo_modules contains the platform demos.
      // The modules dir should contain your own modules.
      defaultValue: ['demo_modules', 'modules'], multiple: true,
      description: 'List of directories of modules and assets.  Everything ' +
          'under these dirs will be available under ' +
          '/asset/(whatever is under your directories).'},
  {name: 'help', type: Boolean},
  {name: 'port', type: Number, defaultValue: 3000},
  {name: 'use_geometry', type: JSON.parse, defaultValue: null},
  {name: 'screen_width', type: Number, defaultValue: 1920},
  {name: 'game_server_host', type: String, defaultValue: ''},
  {name: 'geometry_file', type: String},
  {name: 'credential_dir', type: String},
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
if (flags.use_geometry) {
  wallGeometry.useGeo(flags.use_geometry);
} else if (flags.geometry_file) {
  wallGeometry.useGeo(wallGeometry.loadGeometry(flags.geometry_file));
} else {
  console.log('No wall geometry specified... assuming 1x1.');
  wallGeometry.useGeo([{"right":1},{"down":1},{"left":1},{"up":1}]);
}

if (flags.screen_width) {
  const xscale = flags.screen_width;
  const yscale = xscale * 1080 / 1920;
  wallGeometry.setScale(xscale, yscale);
}

process.on('unhandledRejection', (reason, p) => {
  log.error('Unhandled rejection: ', p);
  log.error(reason);
});

const app = moduleServing.create(flags);

const modulePlayer = new ServerModulePlayer();

game.init(flags);

if (flags.credential_dir) {
  credentials.loadFromDir(flags.credential_dir);
}

var server;
var listener = function() {
  var host = server.address().address;
  var port = server.address().port;

  log(`Server listening at http://${host}:${port}`);
};

if (flags.use_https) {
  const opts = {
    key: fs.readFileSync('certs/server_key.pem'),
    cert: fs.readFileSync('certs/server_cert.pem'),
    requestCert: flags.require_client_cert,
    ca: [fs.readFileSync('certs/server_cert.pem')]
  };

  server = https.createServer(opts, app).listen(flags.port, listener);
} else {
  server = app.listen(flags.port, listener);
}

var peerServer = new PeerServer({port: flags.port + 6000, path: '/peerjs'});
peerServer.on('connection', function(id) {
  log.debugAt(1, 'peer connection!', id);
});
peerServer.on('disconnect', function(id) {
  log.debugAt(1, 'peer disconnect!', id);
});

network.init(server);
network.emitter.on('new-client', client => {
  const nextModule = modulePlayer.nextModule || modulePlayer.oldModule;
  if (nextModule.name != '_empty') {
    // Tell the client to immediately go to the current module.
    tellClientToPlay(client, nextModule.moduleDef, nextModule.deadline);
  }
});

const control = new Control(modulePlayer);
control.installHandlers(app, network.controlSocket());

// Reset back to an empty module on boot (to clean up any clients).
modulePlayer.playModule(RunningModule.empty());
