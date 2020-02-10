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

# Run brick:
node \
  $INSPECT \
  --experimental_modules \
  server/server.js \
  --node_modules_dir './node_modules' \
  --use_geometry '[{"right":1},{"down":1},{"left":1},{"up":1}]' \
  --assets_dir demo_assets \
  "$@" &
readonly BRICK_PID="$!"

# Run status server:
./status/run_status.sh &
readonly STATUS_PID="$!"

function clean_up {
  kill "$BRICK_PID" "$STATUS_PID";
  exit
}

trap clean_up SIGHUP SIGINT SIGTERM
wait $BRICK_PID $STATUS_PID;
