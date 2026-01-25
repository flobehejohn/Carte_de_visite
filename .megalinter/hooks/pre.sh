#!/usr/bin/env bash
set -euo pipefail

WS="${DEFAULT_WORKSPACE:-/tmp/lint}"
OUT_REL="${REPORT_OUTPUT_FOLDER:-megalinter-reports}"
OUT="${WS}/${OUT_REL}"

mkdir -p "${OUT}/meta"

# Observabilité minimale
date -Is > "${OUT}/meta/start.txt" || true
echo "${MEGALINTER_CONFIG:-}" > "${OUT}/meta/config.txt" || true

# Optionnel : info git (ne casse pas le run)
git -C "${WS}" rev-parse --short HEAD > "${OUT}/meta/git_head.txt" 2>/dev/null || true
git -C "${WS}" status --porcelain > "${OUT}/meta/git_status.txt" 2>/dev/null || true
