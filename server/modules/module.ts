/* Copyright 2019 Google Inc. All Rights Reserved.

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

import * as time from "../../lib/adjustable_time.ts";
import * as wallGeometry from "../util/wall_geometry.ts";
import * as moduleTicker from "./module_ticker.ts";
import { assert } from "../../lib/assert.ts";
import * as network from "../network/network.ts";
import * as stateManager from "../network/state_manager.ts";
import { delay } from "../../lib/promise.ts";
import { getGeo } from "../util/wall_geometry.ts";
import { clients } from "../network/network.ts";
import * as path from "https://deno.land/std@0.166.0/path/mod.ts";
import { Server } from "../../server/modules/module_interface.ts";
import { EmptyModuleDef, ModuleDef } from "./module_def.ts";
import { easyLog } from "../../lib/log.ts";
import inject from "../../lib/inject.ts";
import { TypedWebsocketLike } from "../../lib/websocket.ts";
import { ModuleWSS } from "../network/websocket.ts";
import { LoadModuleEvent } from "../../client/modules/events.ts";

const log = easyLog("wall:module");

interface PerModuleDep {
  open(): void;
  close(): void;
}

export class RunningModule {
  readonly name: string;
  readonly loaded: Promise<void>;
  valid = false;

  network?: ModuleWSS;
  stateManager?: PerModuleDep;

  instance?: Server;

  static empty(deadline = 0) {
    return new RunningModule(new EmptyModuleDef(), deadline);
  }
  /**
   * Constructs a running module.
   * NOTE that's it's fine to create one of these with no def, which will simply blank the screen.
   */
  constructor(readonly moduleDef: ModuleDef, readonly deadline: number) {
    assert(moduleDef, "Empty def passed to running module!");
    this.name = this.moduleDef.name;

    if (this.moduleDef.serverPath) {
      // Begin asynchronously validating the module at the server path.
      this.loaded = this.extractServerClass({
        network: {},
        state: {},
      }).then(() => {
        log.debugAt(
          1,
          "Verified " +
            path.join(this.moduleDef.root, this.moduleDef.serverPath),
        );
        this.valid = true;
      }, (err) => {
        log.error(err);
      });
    } else {
      this.valid = true;
      this.loaded = Promise.resolve();
    }
  }

  async extractServerClass(deps: Record<string, unknown>) {
    const fullPath = path.join(
      Deno.cwd(),
      this.moduleDef.root,
      this.moduleDef.serverPath,
    );
    const { load } = await import(fullPath);

    // Inject our deps into node's require environment.
    const fakeEnv = {
      ...deps,
      wallGeometry: wallGeometry.getGeo(),
      debug: easyLog("wall:module:" + this.name),
      assert,
    };

    const { server } = inject(
      load as (
        ...args: unknown[]
      ) => { server: { new (config: unknown): Server } },
      fakeEnv,
    );
    return { server };
  }

  // This is a separate method in order to guard against exceptions in
  // instantiate.
  async instantiate() {
    // Wait for loading to complete.
    await this.loaded;
    // Check for validity.
    if (this.valid) {
      // Only instantiate support objects for valid module defs.
      const INSTANTIATION_ID =
        `${getGeo().extents.serialize()}-${this.deadline}`;
      this.network = new ModuleWSS(network.wss, INSTANTIATION_ID);
      this.stateManager = stateManager.forModule(
        INSTANTIATION_ID,
      );
    } else {
      this.network = undefined;
      this.stateManager = undefined;
    }
    // Tell clients to get ready to play this module at the deadline.
    for (const client of clients.values()) {
      this.tellClientToPlay(client.socket);
    }
    if (this.network) {
      if (this.moduleDef.serverPath) {
        const { server } = await this.extractServerClass({
          network: this.network,
          state: this.stateManager!.open(),
        });
        this.instance = new server(this.moduleDef.config);
      } else {
        this.instance = new Server();
      }
    }
  }

  tellClientToPlay(socket: TypedWebsocketLike) {
    const config: LoadModuleEvent = {
      module: {
        name: this.moduleDef.name,
        path: this.moduleDef.name == "_empty" ? "" : path.join(
          "/module/",
          this.moduleDef.baseName || this.moduleDef.name,
          this.moduleDef.clientPath,
        ),
        config: this.moduleDef.config,
        credit: this.moduleDef.credit,
      },
      time: this.deadline,
      geo: wallGeometry.getGeo().points,
    };
    socket.send("loadModule", config);
  }

  tick(now: number, delta: number) {
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

  async performTransition(
    _otherModule: RunningModule,
    transitionFinishDeadline: number,
  ) {
    await delay(time.until(transitionFinishDeadline));
  }

  dispose() {
    if (this.instance) {
      this.instance.dispose();
    }
    if (this.network) {
      this.stateManager!.close();
      this.network.close();
      this.network = undefined;
    }
  }

  async willBeShownSoon() {
    if (this.instance) {
      await this.instance.willBeShownSoon(this.deadline);
    }
  }
}
