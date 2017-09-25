/* Copyright 2015 Google Inc. All Rights Reserved.

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

const RJSON = require('relaxed-json');
const debug = require('debug')('wall:control');
const log = require('server/util/log');
const playlistDriver = require('server/modules/playlist_driver');
const wallGeometry = require('server/util/wall_geometry');

// Basic server management hooks.
// This is just for demonstration purposes, since the real server
// will not have the ability to listen over http.
class Control {
  constructor(layoutSM, playlistLoader) {
    this.layoutSM = layoutSM;
    this.playlistLoader = playlistLoader;

    this.initialConfig = playlistLoader.getInitialPlaylistConfig();
    this.currentConfig = this.initialConfig;
  }

  installHandlers(app) {
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
      var playlistConfig = this.playlistLoader.parsePlaylist(json);
    } catch (e) {
      res.status(400).send('Bad request: ' + e);
      return;
    }
    playlistDriver.driveStateMachine(playlistConfig, this.layoutSM, true);
    this.currentConfig = json;
    res.redirect('/status');
  }

  getPlaylist(req, res) {
    res.json(this.layoutSM.getPlaylist());
  }

  resetPlaylist(req, res) {
    playlistDriver.driveStateMachine(this.playlistLoader.parsePlaylist(this.initialConfig), this.layoutSM, true);
    this.currentConfig = this.initialConfig;
    res.redirect('/status');
  }

  setPlaylist(req, res) {
    let infinitePlaylist = JSON.stringify({ modules: [req.body], playlist: [{collection: '__ALL__', duration: 86400}] });
    let playlistConfig = {};
    let json = '';
    try {
      json = RJSON.parse(infinitePlaylist);
      playlistConfig = this.playlistLoader.parsePlaylist(json);
    } catch (e) {
      console.log(`Error in setPlaylist: ${e}`);
      res.status(400).send('Bad request: ' + e);
      return;
    }
    this.currentConfig = json;
    playlistDriver.driveStateMachine(playlistConfig, this.layoutSM, true);
    res.redirect('/status');
  }

  getClientState(req, res) {
    res.json(this.layoutSM.getClientState());
  }

  getLayout(req, res) {
    const ret = {};
    let info = this.layoutSM.getCurrentModuleInfo();
    ret.partitions = this.layoutSM.getPartition().map((p, i) => {
      return {
        geo: p, 
        state: info[i].state,
        deadline: info[i].deadline
      };
    });
    ret.wall = wallGeometry.getGeo();
    
    res.json(ret);
  }

  skip(req, res) {
    this.layoutSM.skipAhead();
  }

  playModule(req, res) {
    var moduleName = req.query.module;
    if (!moduleName) {
      res.status(400).send('Expected module parameter');
      return;
    }
    try {
      this.layoutSM.playModule(0, moduleName);
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
