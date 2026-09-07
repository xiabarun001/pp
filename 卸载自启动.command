#!/bin/bash
# pp 开机自启动 - 卸载(Mac 版),连看门狗一起
for P in "$HOME/Library/LaunchAgents/com.pp.pet.plist" \
         "$HOME/Library/LaunchAgents/com.pp.watchdog.plist"; do
  launchctl unload "$P" 2>/dev/null || true
  rm -f "$P"
done
echo "已卸载开机自启动与看门狗(不影响手动双击启动)"
