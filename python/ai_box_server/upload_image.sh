#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_FILE="${IMAGE_FILE:-${SCRIPT_DIR}/dist/ai-box-server.tar}"
REMOTE_USER="${REMOTE_USER:-nvidia}"
REMOTE_DIR="${REMOTE_DIR:-/home/nvidia/Sist}"
REMOTE_FILE="${REMOTE_DIR}/ai-box-server.tar"

if [[ ! -f "${IMAGE_FILE}" ]]; then
  echo "[error] image file not found: ${IMAGE_FILE}"
  echo "run ./build_image.sh first"
  exit 1
fi

read -r -p "AI BOX IP를 입력하세요: " AI_BOX_IP
AI_BOX_IP="${AI_BOX_IP//[[:space:]]/}"

if [[ -z "${AI_BOX_IP}" ]]; then
  echo "[error] AI BOX IP is empty"
  exit 1
fi

echo "[upload] ${IMAGE_FILE} -> ${REMOTE_USER}@${AI_BOX_IP}:${REMOTE_FILE}"
scp "${IMAGE_FILE}" "${REMOTE_USER}@${AI_BOX_IP}:${REMOTE_FILE}"
echo "[done] upload complete"
