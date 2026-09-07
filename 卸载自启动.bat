@echo off
chcp 65001 >nul
rem pp 开机自启动 - 卸载(Windows 版)
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\启动pp.vbs" 2>nul
echo 已卸载开机自启动(不影响手动双击启动)
pause >nul
