@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 第一次运行,先装依赖(需要几分钟)…
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败。
    pause >nul
    exit /b 1
  )
)
call npm start
