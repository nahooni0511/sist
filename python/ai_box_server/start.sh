#!/usr/bin/env bash
set -euo pipefail

IMAGE_FILE="${IMAGE_FILE:-/home/nvidia/Sist/ai-box-server.tar}"

if [[ ! -f "${IMAGE_FILE}" ]]; then
  echo "[error] image file not found: ${IMAGE_FILE}"
  exit 1
fi

IMAGE_REPO="${IMAGE_REPO:-sistrun/ai-box-server}"
CONTAINER_NAME="${CONTAINER_NAME:-ai-box-stand-hold}"
RESTART_POLICY="${RESTART_POLICY:-always}"

PORT="${AIBOX_PORT:-8091}"
CAMERA_MODE="${AIBOX_CAMERA_MODE:-auto}"
VIDEO_SOURCE="${AIBOX_VIDEO_SOURCE:-0}"
FPS="${AIBOX_FPS:-12}"
JPEG_QUALITY="${AIBOX_JPEG_QUALITY:-80}"
SESSION_SECONDS="${AIBOX_SESSION_SECONDS:-5}"
SCORING_DEVICE="${AIBOX_SCORING_DEVICE:-auto}"

echo "[load] ${IMAGE_FILE}"
docker load -i "${IMAGE_FILE}"

if ! docker image inspect "${IMAGE_REPO}" >/dev/null 2>&1; then
  echo "[error] loaded image mismatch. expected: ${IMAGE_REPO}"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
  echo "[stop] remove existing container: ${CONTAINER_NAME}"
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

echo "[run] ${CONTAINER_NAME} with ${IMAGE_REPO}"
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart "${RESTART_POLICY}" \
  --init \
  -e "OPENAI_API_KEY=${OPENAI_API_KEY:-}" \
  -p "${PORT}:${PORT}" \
  "${IMAGE_REPO}" \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --camera-mode "${CAMERA_MODE}" \
  --video-source "${VIDEO_SOURCE}" \
  --fps "${FPS}" \
  --jpeg-quality "${JPEG_QUALITY}" \
  --session-seconds "${SESSION_SECONDS}" \
  --scoring-device "${SCORING_DEVICE}" \
  --send-landmarks \
  ${EXTRA_ARGS:-}

echo "[done] container started: ${CONTAINER_NAME}"
echo "[logs] docker logs -f ${CONTAINER_NAME}"
