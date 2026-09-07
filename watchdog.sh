#!/bin/bash
# pp 看门狗:每分钟摸一次 /health,无响应就杀掉卡死的进程,
# 由主 LaunchAgent 的 KeepAlive(SuccessfulExit=false)负责拉起新的。
# 由 com.pp.watchdog LaunchAgent 以 StartInterval 调用,也可手动执行。
PORT="${PET_PORT:-38998}"
LOG="$HOME/Library/Logs/pp.log"

curl -sf -m 6 "http://127.0.0.1:$PORT/health" >/dev/null && exit 0

# health 不通:找占着端口的进程(主进程),杀掉让 launchd 重启
PID=$(lsof -ti "tcp:$PORT" 2>/dev/null | head -1)
if [ -n "$PID" ]; then
  echo "$(date '+%F %T') [watchdog] /health 无响应,kill -9 $PID" >> "$LOG"
  kill -9 "$PID"
else
  # 端口没人听:进程可能已死,KeepAlive 会处理;只记一笔
  echo "$(date '+%F %T') [watchdog] /health 无响应且端口无监听" >> "$LOG"
fi
