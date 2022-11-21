#!/bin/bash

exec deno run --allow-write --allow-read --allow-net --allow-env status/index.ts \
  --port 3001
