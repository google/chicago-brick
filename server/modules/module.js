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

import * as game from '../game/game.js';
import * as time from '../util/time.js';
import * as wallGeometry from '../util/wall_geometry.js';
import * as moduleTicker from './module_ticker.js';
import assert from '../../lib/assert.js';
import library from './module_library.js';
import * as network from '../network/network.js';
import * as stateManager from '../state/state_manager.js';
import {delay} from '../../lib/promise.js';
import {getGeo} from '../util/wall_geometry.js';
import {clients} from '../network/network.js';

export function tellClientToPlay(client, name, deadline) {
  client.socket.emit('loadModule', {
    module: library.modules[name].serializeForClient(),
    time: deadline,
    geo: wallGeometry.getGeo().points
  });
}

export class RunningModule {
  static empty(deadline = 0) {
    return new RunningModule(library.modules['_empty'], deadline);
  }
  /**
   * Constructs a running module.
   * NOTE that's it's fine to create one of these with no def, which will simply blank the screen.
   */
  constructor(moduleDef, deadline) {
    assert(moduleDef, 'Empty def passed to running module!');
    this.moduleDef = moduleDef;
    this.deadline = deadline;

    this.name = this.moduleDef.name;

    if (this.moduleDef.valid) {
      // Only instantiate support objects for valid module defs.
      const INSTANTIATION_ID = `${getGeo().extents.serialize()}-${deadline}`;
      this.network = network.forModule(INSTANTIATION_ID);
      this.gameManager = game.forModule(INSTANTIATION_ID);
      this.stateManager = stateManager.forModule(network.getSocket(), INSTANTIATION_ID);
    } else {
      this.network = null;
      this.gameManager = null;
      this.stateManager = null;
    }
  }

  // This is a separate method in order to guard against exceptions in
  // instantiate.
  instantiate() {
    // Tell clients to get ready to play this module at the deadline.
    for (const id in clients) {
      tellClientToPlay(clients[id], this.name, this.deadline);
    }
    if (this.network) {
      let openNetwork = this.network.open();
      let openState = this.stateManager.open();
      this.instance = this.moduleDef.instantiate(openNetwork, this.gameManager, openState, this.deadline);
    }
  }

  tick(now, delta) {
    if (this.instance) {
      this.instance.tick(now, delta);
    }
  }

  beginTransitionIn() {
    moduleTicker.add(this);
  }
  beginTransitionOut() {}
  finishTransitionIn() {}
  finishTransitionOut() {
    moduleTicker.remove(this);
  }

  async performTransition(otherModule, transitionFinishDeadline) {
    await delay(time.until(transitionFinishDeadline));
  }

  dispose() {
    if (this.instance) {
      this.instance.dispose();
    }
    if (this.network) {
      this.stateManager.close();

      // Clean up game sockets.
      this.gameManager.dispose();

      // This also cleans up stateManager.
      this.network.close();
      this.network = null;
    }
  }

  async willBeShownSoon(deadline) {
    if (this.instance) {
      await this.instance.willBeShownSoon(deadline);
    }
  }
}
