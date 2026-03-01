#!/usr/bin/env bash
set -euo pipefail

cd /repo

export ANIMA_STATE_DIR="/tmp/anima-test"
export ANIMA_CONFIG_PATH="${ANIMA_STATE_DIR}/anima.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${ANIMA_STATE_DIR}/credentials"
mkdir -p "${ANIMA_STATE_DIR}/agents/main/sessions"
echo '{}' >"${ANIMA_CONFIG_PATH}"
echo 'creds' >"${ANIMA_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${ANIMA_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm anima reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${ANIMA_CONFIG_PATH}"
test ! -d "${ANIMA_STATE_DIR}/credentials"
test ! -d "${ANIMA_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${ANIMA_STATE_DIR}/credentials"
echo '{}' >"${ANIMA_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm anima uninstall --state --yes --non-interactive

test ! -d "${ANIMA_STATE_DIR}"

echo "OK"
