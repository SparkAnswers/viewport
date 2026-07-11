#!/usr/bin/env bash
# Cross-compile the Viewport backend for every platform Grafana runs on.
# Grafana looks for "<executable>_<GOOS>_<GOARCH>[.exe]" (from plugin.json's
# "executable": "gpx_viewport"), and the catalog serves one plugin zip to all
# platforms, so every target below must be present in dist/.
set -euo pipefail

cd "$(dirname "$0")/pkg"
OUT=../dist
mkdir -p "$OUT"

targets=(
  "linux/amd64"
  "linux/arm64"
  "linux/arm"
  "windows/amd64"
  "darwin/amd64"
  "darwin/arm64"
)

for t in "${targets[@]}"; do
  os="${t%/*}"
  arch="${t#*/}"
  ext=""
  [ "$os" = "windows" ] && ext=".exe"
  out="$OUT/gpx_viewport_${os}_${arch}${ext}"
  echo "building $out"
  goarm=""
  [ "$arch" = "arm" ] && goarm="GOARM=7"
  env CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" $goarm \
    go build -trimpath -o "$out" .
done

chmod 755 "$OUT"/gpx_viewport_* 2>/dev/null || true
echo "backend build complete:"
ls -1 "$OUT"/gpx_viewport_*
