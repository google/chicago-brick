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

import { CreditJson } from "../../client/title_card.ts";

/**
 * The ModuleDef class contains all the information necessary to load &
 * instantiate a module, including code location and config parameters.
 */
export class ModuleDef {
  /** The path to the client main file of the module. */
  readonly clientPath: string;
  /** The path to the server main file of the module. */
  readonly serverPath: string;

  constructor(
    readonly name: string,
    readonly root: string,
    paths: { client: string; server: string },
    readonly baseName: string,
    readonly config: Record<string, unknown>,
    readonly credit: CreditJson,
    readonly testonly: boolean,
  ) {
    this.clientPath = paths.client;
    this.serverPath = paths.server;
  }
}

/**
 * A special null-type version of the ModuleDef.
 * When the wall is told to play instances of this class, the wall will go black.
 */
export class EmptyModuleDef extends ModuleDef {
  constructor() {
    super(
      "_empty",
      "",
      {
        client: "",
        server: "",
      },
      "",
      {},
      {} as CreditJson,
      true,
    );
    // TODO(applmak): ^ this hacky.
  }
}
