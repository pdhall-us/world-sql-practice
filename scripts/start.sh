#!/usr/bin/env sh
# Author: Prateek Dhall — World Dataset Assignment.
set -eu
cd "$(dirname "$0")/.."
./scripts/fetch-world.sh
docker compose up --build
