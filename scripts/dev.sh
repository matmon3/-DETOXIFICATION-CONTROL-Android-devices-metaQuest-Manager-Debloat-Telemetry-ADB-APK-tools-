#!/usr/bin/env bash
# Inicia o AQM em modo desenvolvimento (frontend vite + tauri debug).
# Uso: ./scripts/dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.cargo/bin:$PATH"
cd "$ROOT"

exec setsid ./frontend/node_modules/.bin/tauri dev "$@" >>"$ROOT/dev.log" 2>&1
