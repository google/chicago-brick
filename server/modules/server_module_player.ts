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

import * as monitor from "../monitoring/monitor.ts";
import { ModulePlayer } from "../../lib/module_player.ts";
import { RunningModule } from "./module.ts";

export class ServerModulePlayer extends ModulePlayer {
  constructor() {
    super({
      makeEmptyModule: () => {
        return RunningModule.empty();
      },
      monitor: {
        isEnabled() {
          return monitor.isEnabled();
        },
        update(obj: unknown) {
          monitor.update({ server: obj });
        },
      },
      logName: "wall:server_state_machine",
    });
  }
}
