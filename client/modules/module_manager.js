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

define(function(require) {
  "use strict";
  var _ = require('underscore');
  var L = require('leaflet');
  require('leaflet-edgebuffer');
  var Noise = require('noisejs');

  var asset = require('client/asset/asset');
  var moduleAssert = require('lib/assert');
  var peerNetwork = require('client/network/peer');
  var debug = require('client/util/debug');
  var error = require('client/util/log').error(debug);
  var ClientModule = require('client/modules/module');
  var moduleInterface = require('lib/module_interface');
  var network = require('client/network/network');
  var CanvasSurface = require('client/surface/canvas_surface');
  var P5Surface = require('client/surface/p5_surface');
  var Surface = require('client/surface/surface');
  var ThreeJsSurface = require('client/surface/threejs_surface');
  var timeManager = require('client/util/time');
  var ClientStateMachine = require('client/modules/client_state_machine');
  var fakeRequire = require('lib/fake_require');
  var geometry = require('lib/geometry');
  var safeEval = require('lib/eval');
  var loadYoutubeApi = require('client/util/load_youtube_api');
  var StateManager = require('client/state/state_manager');
  var NeighborPersistence = require('client/network/neighbor_persistence');
  var TitleCard = require('client/title_card');
  // Node modules made available to client-side modules.
  // Entries with "undefined" are only available on the server;
  // we mention them here so that the client module can call require()
  // without throwing.
  var exposedNodeModules = {
    NeighborPersistence: NeighborPersistence,
    noisejs: Noise,
    assert: moduleAssert,
    asset: asset,
    'gl-matrix': undefined,
    googleapis: undefined,
    jsfeat: undefined,
    leaflet: L,
    loadYoutubeApi: loadYoutubeApi,
    lwip: undefined,
    pngparse: undefined,
    querystring: undefined,
    random: undefined,
    request: undefined,
    underscore: _,
    x2x: undefined,
    xml2js: undefined,
  };

  function loadModule(name, dependencies, code) {
    var def;
    try {
      // The namespace available to client modules.
      // Note that this extends "dependencies", defined below, and also
      // cf. the server-side version in server/modules/module_defs.js.
      var sandbox = _.extend({
        register: function(ignoredServerSide, clientSide) {
          def = clientSide;
        },
        require: fakeRequire.createEnvironment(exposedNodeModules),
        ServerModuleInterface: moduleInterface.Server,
        ClientModuleInterface: moduleInterface.Client,
        Object: Object,
        Surface: Surface,
        CanvasSurface: CanvasSurface,
        P5Surface: P5Surface,
        ThreeJsSurface: ThreeJsSurface,
        geometry: geometry,
        Promise: Promise,
        loadYoutubeApi: loadYoutubeApi,
        debug: debug('wall:module:' + name),
      }, dependencies);
      safeEval(code, sandbox);
      if (!def) {
        throw new Error('Failed to parse module ' + name);
      }
      if (!(def.prototype instanceof moduleInterface.Client)) {
        throw new Error('Malformed module definition! ' + name);
      }
    } catch (e) {
      console.error('Error loading ' + name, e);
      error(e);
    }
    return def;
  }

  var ModuleManager = function() {
    // The state machine.
    this.stateMachine = new ClientStateMachine;
  };
  ModuleManager.prototype.start = function() {
    timeManager.start();

    // Server has asked us to load a new module.
    network.on('loadModule', function(bits) {
      var def = bits.module;
      var code = bits.def;
      var deadline = bits.time;
      var geo = new geometry.Polygon(bits.geo);

      var titleCard = new TitleCard(def);

      var moduleNetwork = network.forModule(
        `${geo.extents.serialize()}-${deadline}`);
      var openNetwork = moduleNetwork.open();

      var deps = {
        _network: moduleNetwork,
        network: openNetwork,
        titleCard: titleCard.getModuleAPI(),
        state: new StateManager(openNetwork),
        globalWallGeometry: geo,
        wallGeometry: new geometry.Polygon(geo.points.map(function(p) {
          return {x: p.x - geo.extents.x, y: p.y - geo.extents.y};
        }, this)),
        peerNetwork: peerNetwork,
      };

      var clientModuleClass = loadModule(def.name, deps, code);
      if (!clientModuleClass) {
        throw new Error('Failed to load module!');
      }

      this.stateMachine.nextModule(
          new ClientModule(def, clientModuleClass, deps, titleCard, deadline));
    }.bind(this));
  };

  return ModuleManager;
});
