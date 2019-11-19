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

import * as wallGeometry from './util/wall_geometry.js';
import * as time from './util/time.js';
import {emitter, clients} from './network/network.js';
import {easyLog} from '../lib/log.js';
import {getErrors} from './util/last_n_errors_logger.js';
import library from './modules/module_library.js';

const log = easyLog('wall:control');
// Basic server management hooks.
// This is just for demonstration purposes, since the real server
// will not have the ability to listen over http.
export class Control {
  constructor(playlistDriver, moduleLoader, playlistLoader) {
    this.playlistDriver = playlistDriver;
    this.playlistLoader = playlistLoader;
    this.moduleLoader = moduleLoader;

    this.initialConfig = playlistLoader.getInitialPlaylistConfig();
    this.currentConfig = this.initialConfig;
  }

  installHandlers(app, io) {
    let transitionData = {};
    this.playlistDriver.on('transition', data => {
      transitionData = data;
      io.emit('transition', data);
    });
    emitter.on('new-client', c => {
      io.emit('new-client', c.rect.serialize());
      c.socket.on('takeSnapshotRes', res => {
        io.emit('takeSnapshotRes', res);
      });
      c.socket.on('record-error', err => {
        io.emit('error', err);
      });
    });
    emitter.on('lost-client', c => {
      io.emit('lost-client', c.rect.serialize());
    });
    io.on('connection', socket => {
      // When we transition to a new module, let this guy know.
      socket.emit('time', {time: time.now()});
      socket.emit('transition', transitionData);
      socket.emit('clients', Object.values(clients).map(c => c.rect.serialize()));
      socket.emit('wallGeometry', wallGeometry.getGeo().points);
      socket.emit('errors', getErrors());

      socket.on('takeSnapshot', req => {
        const client = Object.values(clients).find(c => c.rect.serialize() == req.client);
        if (client) {
          client.socket.emit('takeSnapshot', req);
        } else {
          socket.emit('takeSnapshotRes', {
            ...req,
            error: `Client ${req.client} not found`
          });
        }
      });
      socket.on('newPlaylist', data => {
        const {playlist, moduleConfig} = data;
        for (const name in moduleConfig) {
          const cfg = moduleConfig[name];
          // Only update new modules that extend other ones.
          if (cfg.extends) {
            log(`Loaded new config: ${cfg.name}`);
            // HACK!
            library.modules[cfg.name] = library.modules[cfg.extends].extend(
                cfg.name, cfg.config || {}, cfg.credit || {});
          }
        }

        this.playlistDriver.setPlaylist(playlist);
      });
      socket.on('resetPlaylist', () => {
        const playlist = this.playlistLoader.parsePlaylist(this.initialConfig);
        this.playlistDriver.start(playlist);
      });
    });
    io.emit('time', {time: time.now()});
    setInterval(() => {
      io.emit('time', {time: time.now()});
    }, 20000);
  }
}
