import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import express from 'express';
import path from 'path';
import fs from 'fs';
import io from 'socket.io-client';
import socketio from 'socket.io';

import {loadAllBrickJson, loadPlaylistFromFile} from './playlist_loader.js';
import {PlaylistDriver} from './playlist_driver.js';

const FLAG_DEFS = [
  {name: 'port', type: Number, defaultValue: 3000},
  {name: 'layout_duration', type: Number},
  {name: 'module_duration', type: Number},
  {name: 'playlist', type: String, alias: 'p',
      defaultValue: 'config/demo-playlist.json'},
  {name: 'module_dir', type: String,
      defaultValue: ['demo_modules/*', 'node_modules/*'], multiple: true,
      description: 'A glob pattern matching directories that contain module ' +
          'code may be specified multiple times.'},
  {name: 'module', type: String, alias: 'm', multiple: true,
      description: 'Runs only the selected module or modules.'},
  {name: 'brick_host', type: String,
      description: 'The host:port of the brick server.'},
];
const flags = commandLineArgs(FLAG_DEFS);
if (flags.help) {
  console.log('Available flags: ' + commandLineUsage({optionList: FLAG_DEFS}));
  process.exit();
}

const brickHost = flags.brick_host || 'localhost:3000';
const remote = io(`http://${brickHost}/control`);

const moduleDefsByName = loadAllBrickJson(flags.module_dir);
const playlist = loadPlaylistFromFile(flags.playlist, moduleDefsByName);
if (flags.layout_duration) {
  for (const layout of playlist) {
    layout.duration = flags.layout_duration;
  }
}
if (flags.module_duration) {
  for (const layout of playlist) {
    layout.moduleDuration = flags.module_duration;
  }
}

if (playlist.length === 0) {
  throw new Error('Nothing to play!');
}

class RemoteModulePlayer {
  constructor() {
    this.lastModule_ = {name: '_empty'};
  }
  get oldModule() {
    return this.lastModule_;
  }
  playModule(def, deadline) {
    const config = def == '_empty' ? {name: '_empty'} : def;
    this.lastModule_ = def;
    remote.emit('playModule', {def: JSON.stringify(config), deadline});
  }
}

// The location we are running from.
const cwd = process.cwd();
let staticDir = cwd;
if (fs.existsSync(path.join(cwd, 'node_modules/chicago-brick'))) {
  staticDir = path.join(cwd, 'node_modules/chicago-brick');
}
staticDir = path.join(staticDir, 'status');

console.log(`CWD: ${cwd}`);
console.log(`Static Dir: ${staticDir}`);

const app = express();
app.use('/node_modules', express.static(path.join(cwd, 'node_modules')));
app.use('/', express.static(path.join(staticDir, 'static')));

const server = app.listen(flags.port, () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log(`Server listening at http://${host}:${port}`);
});

const clientIo = socketio(server, {perMessageDeflate: false});

const playlistDriver = new PlaylistDriver(new RemoteModulePlayer(), moduleDefsByName, clientIo);

playlistDriver.setPlaylist(playlist);

clientIo.on('connection', socket => {
  socket.on('resetPlaylist', () => {
    playlistDriver.setPlaylist(playlist);
  });
  socket.on('newPlaylist', ({playlist, moduleConfig}) => {
    console.log('mc', moduleConfig);
    for (const k in moduleConfig) {
      moduleDefsByName.set(k, moduleConfig[k]);
    }
    console.log('playlist', playlist);
    playlistDriver.setPlaylist(playlist);
  });
});
