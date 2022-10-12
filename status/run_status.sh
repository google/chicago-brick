#!/bin/bash

exec deno run --allow-read --allow-net status/index.ts \
  --port 3001
