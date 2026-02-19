#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-ai-box-stand-hold}"

if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
  echo "[stop] remove container: ${CONTAINER_NAME}"
  docker rm -f "${CONTAINER_NAME}" >/dev/null
  echo "[done] container removed: ${CONTAINER_NAME}"
else
  echo "[skip] container not found: ${CONTAINER_NAME}"
fi
