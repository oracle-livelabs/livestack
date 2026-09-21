#!/bin/sh

set -eu

# LiveStack container identity is an orchestration concern. Keep compose.yml
# neutral and immutable, and set the industry-specific project name here.
LIVESTACK_INDUSTRY="retail"
PROJECT_NAME="livestack-${LIVESTACK_INDUSTRY}"

SCRIPT_DIR=$(
  CDPATH= cd -- "$(dirname -- "$0")" && pwd
)
STACK_DIR=$(
  CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd
)

exec podman compose \
  --project-name "${PROJECT_NAME}" \
  --project-directory "${STACK_DIR}" \
  -f "${STACK_DIR}/compose.yml" \
  "$@"
