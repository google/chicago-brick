/* Copyright 2018 Google Inc. All Rights Reserved.

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

import RJSON from 'relaxed-json';
import Debug from 'debug';
import * as wallGeometry from './util/wall_geometry.js';
import * as time from './util/time.js';
import {emitter, clients} from './network/network.js';
import * as log from './util/log.js';
import library from './modules/module_library.js';

const debug = Debug('wall:control');
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
    log.emitter.on('error', e => {
      io.emit('error', e);
    })
    emitter.on('new-client', c => {
      io.emit('new-client', c.rect.serialize());
      c.socket.on('takeSnapshotRes', res => {
        io.emit('takeSnapshotRes', res);
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
      socket.emit('errors', log.recentErrors);

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
            debug(`Loaded new config: ${cfg.name}`);
            // HACK!
            library.modules[cfg.name] = library.modules[cfg.extends].extend(
                cfg.name, cfg.config || {}, cfg.credit || {});
          }
        }

        this.playlistDriver.setPlaylist(playlist);
      });
    });
    io.emit('time', {time: time.now()});
    setInterval(() => {
      io.emit('time', {time: time.now()});
    }, 20000);
  }

  setConfig(req, res) {
    try {
      var json = RJSON.parse(req.body.config);
      this.moduleLoader.loadModules(json);
      var playlist = this.playlistLoader.parsePlaylist(json);
    } catch (e) {
      res.status(400).send('Bad request: ' + e);
      return;
    }
    this.playlistDriver.start(playlist);
    this.currentConfig = json;
    res.redirect('/status');
  }

  resetPlaylist(req, res) {
    this.moduleLoader.loadModules(this.initialConfig);
    this.playlistDriver.start(this.playlistLoader.parsePlaylist(this.initialConfig));
    this.currentConfig = this.initialConfig;
    res.redirect('/status');
  }

  setPlaylist(req, res) {
    let infinitePlaylist = JSON.stringify({ modules: [req.body], playlist: [{collection: '__ALL__', duration: 86400}] });
    let playlist = {};
    let json = '';
    try {
      json = RJSON.parse(infinitePlaylist);
      this.moduleLoader.loadModules(json);
      playlist = this.playlistLoader.parsePlaylist(json);
    } catch (e) {
      console.log(`Error in setPlaylist: ${e}`);
      res.status(400).send('Bad request: ' + e);
      return;
    }
    this.currentConfig = json;
    this.playlistDriver.start(playlist);
    res.redirect('/status');
  }

  skip() {
    this.playlistDriver.skipAhead();
  }

  playModule(req, res) {
    var moduleName = req.query.module;
    if (!moduleName) {
      res.status(400).send('Expected module parameter');
      return;
    }
    try {
      this.playlistDriver.playModule(moduleName);
    } catch (e) {
      debug(e.message);
      debug(e.stack);
      // TODO: distinguish between "module not found" and "unable to enqueue".
      res.status(400).send('Unable to play module');
      return;
    }
    res.send('Enqueued');
  }
}
