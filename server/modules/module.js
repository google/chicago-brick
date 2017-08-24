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

const StateManager = require('server/state/state_manager');
const game = require('server/game/game');
const network = require('server/network/network');

const debug = require('debug')('wall:server_state_machine');
const logError = require('server/util/log').error(debug);

class RunningModule {
  static newEmptyModule() {
    return new RunningModule;
  }
  constructor(moduleDef, geo, deadline) {
    this.moduleDef = moduleDef;
    this.geo = geo;
    this.deadline = deadline;
    
    if (this.moduleDef) {
      const INSTANTIATION_ID = `${geo.extents.serialize()}-${deadline}`;
      this.network = network.forModule(INSTANTIATION_ID);
      this.gameManager = game.forModule(INSTANTIATION_ID);
    }
  }
  
  // This is a separate method in order to guard against exceptions in 
  // instantiate.
  instantiate() {
    if (this.moduleDef) {
      let openNetwork = this.network.open();
      this.stateManager = new StateManager(openNetwork);
      this.instance = this.moduleDef.instantiate(this.geo, openNetwork, this.gameManager, this.stateManager, this.deadline);
    }
  }

  tick(now, delta) {
    if (this.instance) {
      this.instance.tick(now, delta);
      this.stateManager.send();
    }
  }

  dispose() {
    if (this.instance) {
      this.instance.dispose();
    }
    if (this.moduleDef) {
      // Clean up game sockets.
      this.gameManager.dispose();
    
      // This also cleans up stateManager.
      this.network.close();
    }
  }
  
  willBeHiddenSoon(deadline) {
    if (this.instance) {
      this.instance.willBeHiddenSoon(deadline);
    }
  }
  
  willBeShownSoon(deadline) {
    if (this.instance) {
      let ret = this.instance.willBeShownSoon(deadline);
      if (!ret) {
        logError(new Error(`Module ${this.moduleDef.name} should return a promise from willBeShownSoon`));
        return Promise.resolve();
      }
      return ret;
    }
    return Promise.resolve();
  }
}

module.exports = RunningModule;