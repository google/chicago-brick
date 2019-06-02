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

import {delay} from '/lib/promise.js';
import {Polygon} from '/lib/math/polygon2d.js';
import * as log from '/client/util/log.js';
import * as moduleInterface from '/lib/module_interface.js';
import * as moduleTicker from '/client/modules/module_ticker.js';
import * as network from '/client/network/network.js';
import * as peerNetwork from '/client/network/peer.js';
import Debug from '/lib/lame_es6/debug.js';
import assert from '/lib/assert.js';
import asset from '/client/asset/asset.js';
import conform from '/lib/conform.js';
import inject from '/lib/inject.js';
import {StateManager} from '/client/state/state_manager.js';
import {TitleCard} from '/client/title_card.js';
import {now, until} from '/client/util/time.js';

const debug = Debug('wall:client_module');
const error = log.error(debug);

function createNewContainer(name) {
  var newContainer = document.createElement('div');
  newContainer.className = 'container';
  newContainer.id = 't-' + now();
  newContainer.style.opacity = 0.0;
  newContainer.setAttribute('moduleName', name);
  document.querySelector('#containers').appendChild(newContainer);
  return newContainer;
}

export class ClientModule {
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
    this.container = null;

    // Module class instance.
    this.instance = null;

    // Network instance for this module.
    this.network = null;

    // The name of the requirejs context for this module.
    this.contextName = null;
  }

  // Deserializes from the json serialized form of ModuleDef in the server.
  static deserialize(bits) {
    if (bits.module.name == '_empty') {
      return ClientModule.newEmptyModule(bits.time);
    }
    return new ClientModule(
      bits.module.name,
      bits.module.path,
      bits.module.config,
      new TitleCard(bits.module.credit),
      bits.time,
      new Polygon(bits.geo)
    );
  }

  static newEmptyModule(deadline = 0) {
    return new ClientModule(
      'empty-module',
      '',
      {},
      new TitleCard({}),
      deadline,
      new Polygon([{x: 0, y:0}])
    );
  }

  async instantiate() {
    this.container = createNewContainer(this.name);

    if (!this.path) {
      return Promise.resolve();
    }

    this.network = network.forModule(
      `${this.geo.extents.serialize()}-${this.deadline}`);
    let openNetwork = this.network.open();

    this.contextName = 'module-' + this.deadline;

    const fakeEnv = {
      asset,
      debug: Debug('wall:module:' + this.name),
      game: undefined,
      network: openNetwork,
      titleCard: this.titleCard.getModuleAPI(),
      state: new StateManager(openNetwork),
      wallGeometry: this.geo,
      peerNetwork,
      assert,
    };
    const {load} = await import(this.path);
    if (!load) {
      throw new Error(`${this.name} did not export a 'load' function!`);
    }
    const {client} = inject(load, fakeEnv);
    conform(client, moduleInterface.Client);

    this.instance = new client(this.config);
  }

  // Returns true if module is still OK.
  willBeShownSoon() {
    if (!this.path) {
      return true;
    }
    try {
      this.instance.willBeShownSoon(this.container, this.deadline);
      return true;
    } catch(e) {
      error(e);
      return false;
    }
  }

  // Returns true if module is still OK.
  fadeIn(deadline) {
    this.container.style.transition =
        'opacity ' + until(deadline).toFixed(0) + 'ms';
    this.container.style.opacity = 1.0;

    if (!this.path) {
      return true;
    }
    try {
      this.instance.beginFadeIn(deadline);
    } catch(e) {
      error(e);
      return false;
    }
    moduleTicker.add(this.name, this.instance);
    delay(until(deadline)).done(() => {
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
    if (this.container) {
      this.container.style.transition =
          'opacity ' + until(deadline).toFixed(0) + 'ms';
      this.container.style.opacity = 0.0;
    }
    if (!this.path) {
      return true;
    }
    this.titleCard.exit();
    try {
      this.instance.beginFadeOut(deadline);
    } catch(e) {
      error(e);
    }
    return true;
  }

  dispose() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (!this.path) {
      return true;
    }
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

    return true;
  }
}
