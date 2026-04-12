#!/usr/bin/env bash
set -euo pipefail

WS="${DEFAULT_WORKSPACE:-/tmp/lint}"
OUT_REL="${REPORT_OUTPUT_FOLDER:-megalinter-reports}"
OUT="${WS}/${OUT_REL}"

mkdir -p "${OUT}/meta"

# Liste des artefacts produits (chemin relatif pour lisibilité)
find "${OUT}" -type f | sed "s|^${WS}/||" > "${OUT}/meta/artifacts.txt" || true

date -Is > "${OUT}/meta/end.txt" || true
