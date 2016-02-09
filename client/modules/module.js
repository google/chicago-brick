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

  var moduleTicker = require('client/modules/module_ticker');
  var debug = require('client/util/debug')('wall:client_module');
  var error = require('client/util/log').error(debug);
  var timeManager = require('client/util/time');

  function createNewContainer(def) {
    var newContainer = document.createElement('div');
    newContainer.className = 'container';
    newContainer.id = 't-' + timeManager.now();
    newContainer.style.opacity = 0.0;
    newContainer.setAttribute('moduleName', def.name);
    document.querySelector('#containers').appendChild(newContainer);
    return newContainer;
  }

  class ClientModule {
    constructor(def, klass, globals, deadline) {
      // Module definition -- sent from the server.
      this.def = def;

      // Module class instance as eval-ed in module_manager.js.
      this.klass = klass;

      // Global context that was provided to the module.
      this.globals = globals;

      // Absolute time when this module is supposed to be visible. Module will
      // actually be faded in by deadline + 5000ms.
      this.deadline = deadline;

      // The dom container for the module's content.
      this.container = createNewContainer(def);

      // Module class instance.
      this.instance = new this.klass(def.config);
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
        try {
          this.instance.finishFadeIn();
        } catch(e) {
          error(e);
        }
      });
      return true;
    }

    fadeOut(deadline) {
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
      moduleTicker.remove(this.instance);
      this.globals._network.close();
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
