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
deno run \
  $INSPECT \
  --allow-read --allow-net --allow-env --allow-write --allow-run \
  server/server.ts \
  --module_dir 'node_modules/*' \
  --module_dir 'demo_modules/*' \
  --assets_dir demo_assets \
  "$@" &
readonly BRICK_PID="$!"

# Run status server:
./status/run_status.sh &
readonly STATUS_PID="$!"

# Figure out the Chrome path (if not set)
if [ -z "$CHROME" ]; then
  case $(uname) in
  Darwin)
    CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    ;;
  *)
    CHROME=google-chrome
    ;;
  esac
fi

# Boot two chromes:
"$CHROME" \
  --window-position=0,0 \
  --window-size=960,540 \
  --user-data-dir="/tmp/brick-client" \
  --no-first-run \
  http://localhost:3000/ 2>/dev/null &
readonly CLIENT_PID="$!"

"$CHROME" \
  --window-position=960,0 \
  --window-size=960,540 \
  --user-data-dir="/tmp/brick-status" \
  --no-first-run \
  http://localhost:3001/ 2>/dev/null &
readonly STATUS_CLIENT_PID="$!"

function clean_up {
  kill "$BRICK_PID" "$STATUS_PID" "$CLIENT_PID" "$STATUS_CLIENT_PID";
  exit
}

trap clean_up SIGHUP SIGINT SIGTERM
wait $BRICK_PID $STATUS_PID $CLIENT_PID $STATUS_CLIENT_PID;
