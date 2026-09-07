#!/bin/bash
# 一键重打包并替换 /Applications/pp.app(Mac)。改完代码双击这个,新功能就上 app。
set -e
cd "$(dirname "$0")" || exit 1
echo "打包中…"
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir | tail -1
launchctl unload "$HOME/Library/LaunchAgents/com.pp.pet.plist" 2>/dev/null || true
sleep 2
rm -rf /Applications/pp.app
cp -R dist/mac-arm64/pp.app /Applications/
launchctl load "$HOME/Library/LaunchAgents/com.pp.pet.plist" 2>/dev/null \
  || open /Applications/pp.app
echo "完成:新版 pp 已上岗"
