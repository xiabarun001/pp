#!/bin/bash
# pp 桌宠 - 双击启动(Mac 版,等价于 启动桌宠.bat)
cd "$(dirname "$0")" || exit 1
if [ ! -d node_modules ]; then
  echo "第一次运行,先装依赖(需要几分钟)…"
  npm install || { read -n 1 -s -r -p "依赖安装失败,按任意键关闭…"; exit 1; }
fi
npm start
