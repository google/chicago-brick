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

  class ClientModule {
    constructor(name, path, config, titleCard, deadline, geo) {
      // The module name.
      this.name = name;
      
      // The path to the main file of this module.
      this.path = path;

      // The module config.
      this.config = config;
      
      // The title card instance for this module.
      this.titleCard = titleCard;
      
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

      // Network instance for this module.
      this.network = null;

      // The name of the requirejs context for this module.
      this.contextName = null;
    }

    // Deserializes from the json serialized form of ModuleDef in the server.
    static deserialize(bits) {
      return new ClientModule(
        bits.module.name,
        bits.module.path,
        bits.module.config,
        new TitleCard(bits.module),
        bits.time,
        new geometry.Polygon(bits.geo)
      );
    }

    static newEmptyModule(deadline) {
      let ret = new ClientModule(
        'empty-module',
        'client/modules/empty_module.js',
        {},
        new TitleCard({}),
        deadline,
        new geometry.Polygon([{x: 0, y:0}])
      );
      ret.instantiate();
      return ret;
    }

    instantiate() {
      this.network = network.forModule(
        `${this.geo.extents.serialize()}-${this.deadline}`);
      let openNetwork = this.network.open();
    
      this.contextName = 'module-' + this.deadline;
      let classes = {};
      
      return fakeRequire.createEnvironment(this.contextName, {
        debug: debugFactory('wall:module:' + this.name),
        network: openNetwork,
        titleCard: this.titleCard.getModuleAPI(),
        state: new StateManager(openNetwork),
        globalWallGeometry: this.geo,
        wallGeometry: new geometry.Polygon(this.geo.points.map(function(p) {
          return {x: p.x - this.geo.extents.x, y: p.y - this.geo.extents.y};
        }, this)),
        peerNetwork: peerNetwork,
        register: (server, client) => {
          classes.server = server;
          classes.client = client;
        },
      }).then((moduleRequire) => {
        return new Promise((resolve, reject) => {
          moduleRequire([this.path], () => {
            // Remove the module-specific requirejs context. This will force the
            // next require of this module to go to the server, as we're
            // essentially invalidating the local cache of files by trashing
            // this context. Furthermore, as our server will serve this up with
            // a no-cache header, we'll always get fresh code.
            fakeRequire.deleteEnvironment(this.contextName);
    
            // Sanity checks on requested code.
            if (!classes.client) {
              throw new Error('Failed to parse module ' + this.name);
            }
            if (!(classes.client.prototype instanceof moduleInterface.Client)) {
              throw new Error('Malformed module definition! ' + this.name);
            }
            this.instance = new classes.client(this.config);
            resolve();
          }, reject);
        });
      });
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

      if (this.network) {
        this.network.close();
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
