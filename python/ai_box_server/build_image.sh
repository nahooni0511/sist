#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

IMAGE_REPO="${IMAGE_REPO:-sistrun/ai-box-server}"
INSTALL_POSE="${INSTALL_POSE:-1}"
OUTPUT_DIR="${OUTPUT_DIR:-${SCRIPT_DIR}/dist}"
IMAGE_FILE="${OUTPUT_FILE:-${OUTPUT_DIR}/ai-box-server.tar}"

mkdir -p "$(dirname "${IMAGE_FILE}")"

echo "[build] IMAGE_REPO=${IMAGE_REPO}"
echo "[build] IMAGE_FILE=${IMAGE_FILE}"
echo "[build] INSTALL_POSE=${INSTALL_POSE}"

docker build \
  --build-arg "INSTALL_POSE=${INSTALL_POSE}" \
  -t "${IMAGE_REPO}" \
  .

docker save -o "${IMAGE_FILE}" "${IMAGE_REPO}"

echo "[done] image file: ${IMAGE_FILE}"
