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

import * as monitor from '/client/monitoring/monitor.js';
import * as time from '/client/util/time.js';
import Debug from '/lib/lame_es6/debug.js';
import {ClientModule} from '/client/modules/module.js';
import {error} from '/client/util/log.js';

import {configure} from '/lib/module_player.js';

const debug = Debug('wall:client_state_machine');
const reportError = error(debug);

function logError(e) {
  if (monitor.isEnabled()) {
    monitor.update({client: {
      event: e.toString(),
      time: time.now(),
      color: [255, 0, 0]
    }});
  }
  reportError(e);
  debug(e);
}

const clientMonitorWrapper = {
  isEnabled() { return monitor.isEnabled(); },
  update(obj) { monitor.update({client: obj}); }
}

export const ClientModulePlayer = configure({
  makeEmptyModule: ClientModule.newEmptyModule,
  monitor: clientMonitorWrapper,
  debug,
  time,
  logError
});
