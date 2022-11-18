#!/bin/bash
# Copyright 2019 Google Inc. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ==============================================================================


set -x

if [[ $NODEDEBUG ]]; then
  INSPECT='--inspect-brk'
else
  INSPECT=''
fi

deno run \
  $INSPECT \
  --allow-read --allow-net --allow-env --allow-write --allow-run \
  server/server.ts \
  --module_dir 'node_modules/*' \
  --module_dir 'demo_modules/*' \
  --use_geometry '[{"right":2},{"down":1},{"right":1},{"down":1},{"left":1},{"down":1},{"left":2},{"up":1},{"right":1},{"up":1},{"left":1},{"up":1}]' \
  --assets_dir demo_assets \
  "$@" &
readonly BRICK_PID="$!"

function clean_up {
  kill "$BRICK_PID";
  exit
}

trap clean_up SIGHUP SIGINT SIGTERM
wait $BRICK_PID;
