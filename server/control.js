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

'use strict';

const _ = require('underscore');
const RJSON = require('relaxed-json');
const debug = require('debug')('wall:control');
const library = require('server/modules/module_library');
const log = require('server/util/log');
const wallGeometry = require('server/util/wall_geometry');

// Basic server management hooks.
// This is just for demonstration purposes, since the real server
// will not have the ability to listen over http.
class Control {
  constructor(playlistDriver, clients, moduleLoader, playlistLoader) {
    this.playlistDriver = playlistDriver;
    this.clients = clients;
    this.playlistLoader = playlistLoader;
    this.moduleLoader = moduleLoader;

    this.initialConfig = playlistLoader.getInitialPlaylistConfig();
    this.currentConfig = this.initialConfig;
  }

  installHandlers(app) {
    app.get('/api/modules', this.getModules.bind(this));
    app.get('/api/playlist', this.getPlaylist.bind(this));
    app.post('/api/playlist', this.setPlaylist.bind(this));
    app.post('/api/reset-playlist', this.resetPlaylist.bind(this));
    app.get('/api/config', this.getConfig.bind(this));
    app.get('/api/errors', this.getErrors.bind(this));
    app.post('/api/config', this.setConfig.bind(this));
    app.get('/api/layout', this.getLayout.bind(this));
    app.get('/api/clients', this.getClientState.bind(this));
    app.post('/api/skip', this.skip.bind(this));
    app.post('/api/play', this.playModule.bind(this));
  }

  getConfig(req, res) {
    res.json({
      initial: this.initialConfig,
      current: this.currentConfig,
    });
  }

  getErrors(req, res) {
    res.json(log.getRecentErrors());
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

  getModules(req, res) {
    res.json(_.values(library.modules));
  }

  getPlaylist(req, res) {
    res.json(this.playlistDriver.getPlaylist());
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

  getClientState(req, res) {
    const clientState = Object.keys(this.clients)
        .map(k => this.clients[k])
        .map(c => {
          return {
            module: c.getModuleName(),
            rect: c.getClientInfo().rect,
            state: c.state.getName()
          };
        });
    res.json(clientState);
  }

  getLayout(req, res) {
    const ret = {};
    ret.state = this.playlistDriver.getNextTransitionType();
    ret.deadline = this.playlistDriver.getNextDeadline();
    ret.wall = wallGeometry.getGeo();
    
    res.json(ret);
  }

  skip(req, res) {
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

module.exports = Control;
