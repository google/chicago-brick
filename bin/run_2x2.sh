#!/bin/bash
# Copyright 2015 Google Inc. All Rights Reserved.
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
  INSPECT="--debug-brk --inspect"
else
  INSPECT=""
fi

DEBUG=wall:* NODE_PATH=".:node_modules" node $INSPECT server/server.js \
  --node_modules_dir "./node_modules" \
  --module_dir 'node_modules/*' \
  --module_dir 'demo_modules/*' \
  --use_geometry '[{"right":2},{"down":2},{"left":2},{"up":2}]' \
  --assets_dir demo_assets \
  $@
