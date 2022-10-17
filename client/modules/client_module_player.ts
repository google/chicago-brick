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
import * as time from "../util/time.ts";
import { ClientModule } from "./module.ts";
import { easyLog } from "../../lib/log.ts";
import { configure } from "../../lib/module_player.ts";

const log = easyLog("wall:client_state_machine");

const clientMonitorWrapper = {
  isEnabled() {
    return monitor.isEnabled();
  },
  update(obj: unknown) {
    monitor.update({ client: obj });
  },
};

export const ClientModulePlayer = configure({
  makeEmptyModule: ClientModule.newEmptyModule,
  monitor: clientMonitorWrapper,
  log,
  time,
});
