#!/bin/zsh
set -e
atelier_root="$(cd -- "$(dirname -- "$0")" && pwd)"
atelier_electron="$atelier_root/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
if [[ ! -x "$atelier_electron" || ! -x "$atelier_root/native/target/release/card-worker" ]]; then
  print "请先按照 README.md 安装 Electron 并编译 Rust worker。"
  exit 1
fi
cd "$atelier_root"
node scripts/prepare-app-icon.cjs
exec "$atelier_electron" "$atelier_root"
