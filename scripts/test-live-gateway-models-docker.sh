#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${ANIMA_IMAGE:-${ANIMA_IMAGE:-anima:local}}"
CONFIG_DIR="${ANIMA_CONFIG_DIR:-${ANIMA_CONFIG_DIR:-$HOME/.anima}}"
WORKSPACE_DIR="${ANIMA_WORKSPACE_DIR:-${ANIMA_WORKSPACE_DIR:-$HOME/.anima/workspace}}"
PROFILE_FILE="${ANIMA_PROFILE_FILE:-${ANIMA_PROFILE_FILE:-$HOME/.profile}}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

echo "==> Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run gateway live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e ANIMA_LIVE_TEST=1 \
  -e ANIMA_LIVE_GATEWAY_MODELS="${ANIMA_LIVE_GATEWAY_MODELS:-${ANIMA_LIVE_GATEWAY_MODELS:-all}}" \
  -e ANIMA_LIVE_GATEWAY_PROVIDERS="${ANIMA_LIVE_GATEWAY_PROVIDERS:-${ANIMA_LIVE_GATEWAY_PROVIDERS:-}}" \
  -e ANIMA_LIVE_GATEWAY_MODEL_TIMEOUT_MS="${ANIMA_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-${ANIMA_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-}}" \
  -v "$CONFIG_DIR":/home/node/.anima \
  -v "$WORKSPACE_DIR":/home/node/.anima/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && pnpm test:live"
