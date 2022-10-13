#!/bin/bash

exec deno run --allow-read --allow-net --allow-env status/index.ts \
  --port 3001
