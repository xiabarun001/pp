@echo off
chcp 65001 >nul
rem pp 开机自启动 - 安装(Windows 版)。只往当前用户的启动文件夹放一个隐藏启动脚本。
cd /d "%~dp0"
set PET_DIR=%cd%
set VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\启动pp.vbs
> "%VBS%" echo CreateObject("WScript.Shell").Run """%PET_DIR%\启动桌宠.bat""", 0, False
echo 已安装:%VBS%
echo 以后开机登录后 pp 会自己出现(无黑窗)。卸载请双击 卸载自启动.bat
pause >nul
