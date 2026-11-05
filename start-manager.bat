@echo off
REM QwenReplyHelper manager - DAILY USE, double-click this once (Windows)
REM This is the only black window you normally need. It auto-starts the
REM default model (8B, port 18082) and lets the X toolbar switch models
REM with one click, like the phone app: it kills the old llama-server
REM and starts the new one for you. Keep this window open.
REM Manager API: http://127.0.0.1:8090/status (local only)
REM Model files must be in THIS folder (not subfolders):
REM   Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf (about 2.50 GB)
REM   Qwen3.5-4B-Q4_K_M.gguf (about 3.01 GB, only needed for old 4B)
REM   Qwen3-8B-Q4_K_M.gguf (about 5.03 GB, only needed for 8B;
REM     Qwen_ prefix, Q5_K_M about 5.85 GB, or Q8_0 about 8.71 GB also work)
REM Plus llama-server.exe and its DLLs from the same release folder.
REM If this manager is not running, the toolbar falls back to telling
REM you which single-model script to double-click (start-qwen.bat or
REM start-qwen-35-4b.bat) - those are backups, not daily use.
cd /d "%~dp0"
python qwen-manager.py
pause
