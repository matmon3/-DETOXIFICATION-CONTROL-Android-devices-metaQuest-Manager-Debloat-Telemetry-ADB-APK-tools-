#!/usr/bin/env bash
# Compila o DETOXIFICATION CONTROL em modo release e gera os pacotes instaláveis.
#
# Uso:
#   ./scripts/build-release.sh            # RPM (padrão no Fedora)
#   ./scripts/build-release.sh appimage   # AppImage
#   ./scripts/build-release.sh deb        # DEB
#   ./scripts/build-release.sh rpm deb appimage
#
# Artefatos em dist/ na raiz do projeto.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.cargo/bin:$PATH"
cd "$ROOT"

if [[ $# -gt 0 ]]; then
  TARGETS=("$@")
else
  TARGETS=(rpm)
fi

echo ":: DETOXIFICATION CONTROL release build — targets: ${TARGETS[*]}"
echo ":: $(cargo --version 2>/dev/null || echo 'cargo n/a')"

mkdir -p "$ROOT/dist"
rm -f "$ROOT/dist"/*.rpm "$ROOT/dist"/*.AppImage "$ROOT/dist"/*.deb 2>/dev/null || true

BUNDLE_ARGS=()
for t in "${TARGETS[@]}"; do
  BUNDLE_ARGS+=("--bundles" "$t")
done

echo ":: Frontend build"
npm --prefix "$ROOT/frontend" run build

echo ":: Rust build (release) + bundle"
echo ":: Gerando pacotes: ${TARGETS[*]}"
# -j 4 para não saturar CPU/RAM (a máquina também roda o Ollama).
# NO_STRIP=1: no Fedora o strip do linuxdeploy não reconhece .relr.dyn (AppImage).
NO_STRIP=1 "$ROOT/frontend/node_modules/.bin/tauri" build "${BUNDLE_ARGS[@]}" -- -j 4

BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle"
for t in "${TARGETS[@]}"; do
  case "$t" in
    rpm)      cp "$BUNDLE_DIR"/rpm/*.rpm "$ROOT/dist/" 2>/dev/null || true ;;
    deb)      cp "$BUNDLE_DIR"/deb/*.deb "$ROOT/dist/" 2>/dev/null || true ;;
    appimage) cp "$BUNDLE_DIR"/appimage/*.AppImage "$ROOT/dist/" 2>/dev/null || true ;;
  esac
done

echo
echo ":: Build concluído. Artefatos em dist/:"
ls -lh "$ROOT/dist" 2>/dev/null || echo "   (nenhum artefato — verifique os erros acima)"