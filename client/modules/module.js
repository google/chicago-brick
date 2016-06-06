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
  'use strict';

  var _ = require('underscore');
  var L = require('leaflet');
  require('leaflet-edgebuffer');

  var asset = require('client/asset/asset');
  var debug = require('client/util/debug')('wall:client_module');
  var debugFactory = require('client/util/debug');
  var error = require('client/util/log').error(debug);
  var fakeRequire = require('lib/fake_require');
  var geometry = require('lib/geometry');
  var moduleInterface = require('lib/module_interface');
  var network = require('client/network/network');
  var peerNetwork = require('client/network/peer');
  var safeEval = require('lib/eval');
  var StateManager = require('client/state/state_manager');
  var timeManager = require('client/util/time');
  var TitleCard = require('client/title_card');
  var moduleTicker = require('client/modules/module_ticker');

  
  
  function createNewContainer(name) {
    var newContainer = document.createElement('div');
    newContainer.className = 'container';
    newContainer.id = 't-' + timeManager.now();
    newContainer.style.opacity = 0.0;
    newContainer.setAttribute('moduleName', name);
    document.querySelector('#containers').appendChild(newContainer);
    return newContainer;
  }

  // Node modules made available to client-side modules.
  // Entries with "undefined" are only available on the server;
  // we mention them here so that the client module can call require()
  // without throwing.
  var exposedNodeModules = {
    asset: asset,
    'gl-matrix': undefined,
    jsfeat: undefined,
    leaflet: L,
    lwip: undefined,
    pngparse: undefined,
    querystring: undefined,
    request: undefined,
    x2x: undefined,
    xml2js: undefined,
  };

  function loadModule(name, globals, code) {
    var klass;
    try {
      // The namespace available to client modules.
      // Note that this extends "dependencies", defined below, and also
      // cf. the server-side version in server/modules/module_defs.js.
      var sandbox = _.extend({
        register: function(ignoredServerSide, clientSide) {
          klass = clientSide;
        },
        require: fakeRequire.createEnvironment(exposedNodeModules),
        debug: debugFactory('wall:module:' + name),
      }, globals);
      safeEval(code, sandbox);
      if (!klass) {
        throw new Error('Failed to parse module ' + name);
      }
      if (!(klass.prototype instanceof moduleInterface.Client)) {
        throw new Error('Malformed module definition! ' + name);
      }
    } catch (e) {
      console.error('Error loading ' + name, e);
      error(e);
    }
    return klass;
  }

  class ClientModule {
    constructor(name, config, titleCard, code, deadline, geo) {
      // The module name.
      this.name = name;
      
      // The module config.
      this.config = config;
      
      // The title card instance for this module.
      this.titleCard = titleCard;
      
      // The code for this module.
      this.code = code;
      
      // Absolute time when this module is supposed to be visible. Module will
      // actually be faded in by deadline + 5000ms.
      this.deadline = deadline;
      
      // The wall geometry.
      this.geo = geo;
      
      // Globals that are associated with this module.
      this.globals = {};
      
      // The dom container for the module's content.
      this.container = createNewContainer(name);

      // Module class instance.
      this.instance = null;
    }

    // Deserializes from the json serialized form of ModuleDef in the server.
    static deserialize(bits) {
      return new ClientModule(
        bits.module.name,
        bits.module.config,
        new TitleCard(bits.module),
        bits.module.def,
        bits.time,
        new geometry.Polygon(bits.geo)
      );
    }

    static newEmptyModule(deadline) {
      return new ClientModule(
        'empty-module',
        {},
        new TitleCard({}),
        'var ModuleInterface = require("lib/module_interface"); class EmptyModule extends ModuleInterface.Client {} register(null, EmptyModule)',
        deadline,
        new geometry.Polygon([{x: 0, y:0}])
      ).instantiate();
    }

    instantiate() {
      var moduleNetwork = network.forModule(
        `${this.geo.extents.serialize()}-${this.deadline}`);
      var openNetwork = moduleNetwork.open();

      this.globals = {
        _network: moduleNetwork,
        network: openNetwork,
        titleCard: this.titleCard.getModuleAPI(),
        state: new StateManager(openNetwork),
        globalWallGeometry: this.geo,
        wallGeometry: new geometry.Polygon(this.geo.points.map(function(p) {
          return {x: p.x - this.geo.extents.x, y: p.y - this.geo.extents.y};
        }, this)),
        peerNetwork: peerNetwork,
      };

      var clientModuleClass = loadModule(this.name, this.globals, this.code);
      if (!clientModuleClass) {
        throw new Error('Failed to load module!');
      }

      this.instance = new clientModuleClass(this.config);
      return this;
    }

    willBeHiddenSoon() {
      try {
        this.instance.willBeHiddenSoon();
      } catch(e) {
        error(e);
      }
      return true;
    }

    // Returns true if module is still OK.
    willBeShownSoon() {
      try {
        this.instance.willBeShownSoon(this.container, this.deadline);
        return true;
      } catch(e) {
        error(e);
        return false;
      }
      return true;
    }

    // Returns true if module is still OK.
    fadeIn(deadline) {
      try {
        this.instance.beginFadeIn(deadline);
      } catch(e) {
        error(e);
        return false;
      }
      moduleTicker.add(this.instance, this.globals);
      this.container.style.transition =
          'opacity ' + timeManager.until(deadline).toFixed(0) + 'ms';
      this.container.style.opacity = 1.0;
      Promise.delay(timeManager.until(deadline)).done(() => {
        this.titleCard.enter();
        try {
          this.instance.finishFadeIn();
        } catch(e) {
          error(e);
        }
      });
      return true;
    }

    fadeOut(deadline) {
      this.titleCard.exit();
      try {
        this.instance.beginFadeOut(deadline);
      } catch(e) {
        error(e);
      }
      this.container.style.transition =
          'opacity ' + timeManager.until(deadline).toFixed(0) + 'ms';
      this.container.style.opacity = 0.0;
      return true;
    }

    dispose() {
      this.titleCard.exit();  // Just in case.
      moduleTicker.remove(this.instance);

      // TODO(bmt): Make this a member variable of ClientModule rather than
      // reaching into the globals.
      if (this.globals._network) {
        this.globals._network.close();
      }
      try {
        this.instance.finishFadeOut();
      } catch(e) {
        error(e);
      }
      this.container.remove();
      this.container = null;
      return true;
    }
  }

  return ClientModule;
});
