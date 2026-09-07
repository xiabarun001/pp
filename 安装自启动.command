#!/bin/bash
# pp 开机自启动 - 安装(Mac 版)。只写当前用户的 LaunchAgent,不碰系统级配置。
# 装两个 agent:主进程(优先 /Applications 的 app 版,没有则源码版)+ 每分钟一次的看门狗。
set -e
cd "$(dirname "$0")" || exit 1
PET_DIR="$(pwd)"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
PLIST="$HOME/Library/LaunchAgents/com.pp.pet.plist"
WPLIST="$HOME/Library/LaunchAgents/com.pp.watchdog.plist"

# 主进程:装过 app 用 app,否则用仓库源码 + electron
if [ -x "/Applications/pp.app/Contents/MacOS/pp" ]; then
  PROG="<string>/Applications/pp.app/Contents/MacOS/pp</string>"
  ENVBLOCK=""
else
  NODE_BIN="$(dirname "$(command -v node)")"
  [ -z "$NODE_BIN" ] && { echo "找不到 node,先装 Node.js"; exit 1; }
  PROG="<string>$PET_DIR/node_modules/.bin/electron</string><string>$PET_DIR</string>"
  ENVBLOCK="<key>EnvironmentVariables</key><dict><key>PATH</key><string>$NODE_BIN:/usr/bin:/bin</string></dict>"
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.pp.pet</string>
  <key>ProgramArguments</key><array>$PROG</array>
  $ENVBLOCK
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/pp.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/pp.log</string>
</dict>
</plist>
EOF

cat > "$WPLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.pp.watchdog</string>
  <key>ProgramArguments</key><array><string>$PET_DIR/watchdog.sh</string></array>
  <key>StartInterval</key><integer>60</integer>
</dict>
</plist>
EOF
chmod +x "$PET_DIR/watchdog.sh"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl unload "$WPLIST" 2>/dev/null || true
launchctl load "$PLIST"
launchctl load "$WPLIST"
echo "已安装:"
echo "  $PLIST(崩溃自动拉起)"
echo "  $WPLIST(每分钟健康检查,卡死自动重启)"
echo "以后开机登录后 pp 会自己出现。卸载请双击 卸载自启动.command"
