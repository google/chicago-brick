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

import { Polygon } from "../../lib/math/polygon2d.ts";
import * as moduleTicker from "./module_ticker.ts";
import * as network from "../network/network.ts";
import * as peerNetwork from "../network/peer.ts";
import { easyLog } from "../../lib/log.ts";
import { assert } from "../../lib/assert.ts";
import asset from "../asset/asset.ts";
import inject from "../../lib/inject.ts";
import * as stateManager from "../network/state_manager.ts";
import { CreditJson, TitleCard } from "../title_card.ts";
import * as time from "../../lib/adjustable_time.ts";
import { delay } from "../../lib/promise.ts";
import { Client } from "../../client/modules/module_interface.ts";
import { ModuleWS } from "../../lib/websocket.ts";
import { LoadModuleEvent } from "./events.ts";

function createNewContainer(name: string) {
  const newContainer = document.createElement("div");
  newContainer.className = "container";
  newContainer.id = "t-" + time.now();
  newContainer.setAttribute("moduleName", name);
  return newContainer;
}

export const FadeTransition = {
  start(container: HTMLElement) {
    if (container) {
      container.style.opacity = "0.001";
      document.querySelector("#containers")!.appendChild(container);
    }
  },
  async perform(
    oldModule: ClientModule,
    newModule: ClientModule,
    deadline: number,
  ) {
    if (newModule.name == "_empty") {
      // Fading out.. so fade *out* the *old* container.
      oldModule.container!.style.transition = "opacity " +
        time.until(deadline).toFixed(0) + "ms";
      oldModule.container!.style.opacity = "0.0";
    } else {
      newModule.container!.style.transition = "opacity " +
        time.until(deadline).toFixed(0) + "ms";
      newModule.container!.style.opacity = "1.0";
    }
    // TODO(applmak): Maybe wait until css says that the transition is done?
    await delay(time.until(deadline));
  },
};

export class ClientModule {
  container: HTMLElement | null;
  instance: Client | null;
  network: ModuleWS | null;
  stateManager: {
    open(): stateManager.ModuleState;
    close(): void;
  } | null;
  peerNetwork: peerNetwork.ModulePeer | null;

  constructor(
    readonly name: string,
    readonly path: string,
    readonly config: unknown,
    readonly titleCard: TitleCard,
    readonly deadline: number,
    readonly geo: Polygon,
    readonly transition: {
      start(e: HTMLElement): void;
      perform(
        a: ClientModule,
        b: ClientModule,
        deadline: number,
      ): Promise<void>;
    },
  ) {
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

    // The transition to use to transition to this module.
    this.transition = transition;

    // The dom container for the module's content.
    this.container = null;

    // Module class instance.
    this.instance = null;

    // Network instance for this module.
    this.network = null;

    this.stateManager = null;
    this.peerNetwork = null;
  }

  tellClientToPlay() {}

  // Deserializes from the json serialized form of ModuleDef in the server.
  static deserialize(bits: LoadModuleEvent) {
    if (bits.module.name == "_empty") {
      return ClientModule.newEmptyModule(bits.time);
    }
    return new ClientModule(
      bits.module.name,
      bits.module.path,
      bits.module.config,
      new TitleCard(bits.module.credit),
      bits.time,
      new Polygon(bits.geo),
      FadeTransition,
    );
  }

  static newEmptyModule(deadline = 0, transition = FadeTransition) {
    return new ClientModule(
      "_empty",
      "",
      {},
      new TitleCard({} as CreditJson),
      deadline,
      new Polygon([{ x: 0, y: 0 }]),
      transition,
    );
  }

  // Extracted out for testing purposes.
  static async loadPath(path: string) {
    return await import(path);
  }

  async instantiate() {
    this.container = createNewContainer(this.name);

    if (!this.path) {
      return;
    }

    const INSTANTIATION_ID = `${this.geo.extents.serialize()}-${this.deadline}`;
    this.network = new ModuleWS(network.socket, INSTANTIATION_ID);
    this.stateManager = stateManager.forModule(
      INSTANTIATION_ID,
    );
    this.peerNetwork = peerNetwork.forModule(INSTANTIATION_ID);
    const fakeEnv = {
      asset,
      debug: easyLog("wall:module:" + this.name),
      game: undefined,
      network: this.network,
      titleCard: this.titleCard.getModuleAPI(),
      state: this.stateManager.open(),
      wallGeometry: this.geo,
      peerNetwork: this.peerNetwork,
      assert,
    };
    try {
      const { load } = await ClientModule.loadPath(this.path);
      if (!load) {
        throw new Error(`${this.name} did not export a 'load' function!`);
      }
      const { client } = inject(
        load as (
          ...args: unknown[]
        ) => { client: { new (config: unknown): Client } },
        fakeEnv,
      );
      this.instance = new client(this.config);
    } catch (e) {
      // something went very wrong. Wind everything down.!
      this.network.close();
      this.network = null;
      throw e;
    }
  }

  // Returns true if module is still OK.
  async willBeShownSoon() {
    if (!this.path) {
      return;
    }
    // Prep the container for transition.
    // TODO(applmak): Move the transition smarts out of ClientModule.
    this.transition.start(this.container!);
    try {
      await this.instance!.willBeShownSoon(this.container, this.deadline);
    } catch (e) {
      this.dispose();
      throw e;
    }
  }

  // Returns true if module is still OK.
  beginTransitionIn(deadline: number) {
    if (!this.path) {
      return;
    }
    moduleTicker.add(this.name, this.instance!);
    try {
      this.instance!.beginFadeIn(deadline);
    } catch (e) {
      this.dispose();
      throw e;
    }
  }

  finishTransitionIn() {
    if (!this.path) {
      return;
    }
    this.titleCard.enter();
    this.instance!.finishFadeIn();
  }

  beginTransitionOut() {
    if (!this.path) {
      return;
    }
    this.titleCard.exit();
    this.instance!.beginFadeOut();
  }

  finishTransitionOut() {
    if (!this.path) {
      return;
    }
    this.instance!.finishFadeOut();
  }

  async performTransition(
    otherModule: ClientModule,
    transitionFinishDeadline: number,
  ) {
    await this.transition.perform(otherModule, this, transitionFinishDeadline);
  }

  dispose() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (!this.path) {
      return;
    }
    this.titleCard.exit(); // Just in case.
    moduleTicker.remove(this.instance!);

    if (this.network) {
      this.peerNetwork?.close();
      this.stateManager!.close();
      this.stateManager = null;
      this.network.close();
      this.network = null;
    }
  }
}
