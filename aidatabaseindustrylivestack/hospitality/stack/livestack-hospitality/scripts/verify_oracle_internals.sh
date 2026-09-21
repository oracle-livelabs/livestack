#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

node verification/check-oracle-internals-source.js
node verification/export-oracle-internals-sql.js |
  podman compose exec -T db bash -lc \
    'sqlplus -L -s "${ORACLE_USER}/${APP_SCHEMA_PASSWORD}@localhost:1521/FREEPDB1"'
