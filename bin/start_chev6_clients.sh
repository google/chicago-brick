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

if [ -z $CHROME ]; then
    case $(uname) in
    Darwin)
        CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        ;;
    *)
        CHROME=google-chrome
        ;;
    esac
fi

verbose=0

while getopts "v:" opt; do
    case "$opt" in
    v)  verbose=1
        ;;
    f)  output_file=$OPTARG
        ;;
    esac
done

shift $((OPTIND-1))

[ "$1" = "--" ] && shift

STANDARD_FLAGS="--ignore-gpu-blacklist --no-default-browser-check --disable-translate --no-first-run"
if [[ ${verbose} == 1 ]]
then
  STANDARD_FLAGS="${STANDARD_FLAGS} --show-fps-counter"
fi

"$CHROME" $STANDARD_FLAGS --window-position=580,584 --window-size=480,270 \
        --app="http://localhost:3000/?config=1920,2160,1920,1080" --user-data-dir=/tmp/clientx10 &
"$CHROME" $STANDARD_FLAGS --window-position=100,584 --window-size=480,270 \
        --app="http://localhost:3000/?config=0,2160,1920,1080" --user-data-dir=/tmp/clientx00 &
sleep 3
"$CHROME" $STANDARD_FLAGS --window-position=1060,342 --window-size=480,270 \
        --app="http://localhost:3000/?config=3840,1080,1920,1080" --user-data-dir=/tmp/clientx11 &
"$CHROME" $STANDARD_FLAGS --window-position=580,342 --window-size=480,270 \
        --app="http://localhost:3000/?config=1920,1080,1920,1080" --user-data-dir=/tmp/clientx01 &
sleep 3
"$CHROME" $STANDARD_FLAGS --window-position=580,100 --window-size=480,270 \
        --app="http://localhost:3000/?config=1920,0,1920,1080" --user-data-dir=/tmp/clientx12 &
"$CHROME" $STANDARD_FLAGS --window-position=100,100 --window-size=480,270 \
        --app="http://localhost:3000/?config=0,0,1920,1080" --user-data-dir=/tmp/clientx02 &

readonly CLIENT_PID="$!"
function clean_up {
  kill "$CLIENT_PID";
  exit
}
trap clean_up SIGHUP SIGINT SIGTERM
wait $CLIENT_PID;
