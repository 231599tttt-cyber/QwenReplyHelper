#!/bin/sh
# QwenReplyHelper manager - DAILY USE (macOS / Linux)
# Double-click equivalent: sh start-manager.sh, keep the terminal open.
# Auto-starts the default model (2507, port 18080). The X toolbar then
# switches models with one click, like the phone app.
# Manager API: http://127.0.0.1:8090/status (local only)
# Model files must be in THIS folder (not subfolders).
# Backups if this manager is not running: start-qwen.sh / start-qwen-35-4b.sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  python3 qwen-manager.py
else
  python qwen-manager.py
fi
