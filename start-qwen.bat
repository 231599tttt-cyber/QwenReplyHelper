@echo off
REM QwenReplyHelper - Model A (new, default) local service starter (Windows)
REM Model B (old 4B, port 18081) uses start-qwen-35-4b.bat instead.
REM Run this on YOUR OWN computer. No VPS, no cloud.
REM 1) Download llama-server from a llama.cpp release and put
REM    llama-server.exe in this folder (or on PATH).
REM 2) Download the model GGUF from the mirror below into this folder.
REM    Model: Qwen3-4B-Instruct-2507 Q4_K_M
REM    URL: https://hf-mirror.com/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf
REM    Size: 2497280736 bytes (about 2.50 GB)
REM    SHA256: 2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e
REM    Verify with: certutil -hashfile Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf SHA256
REM 3) Double-click this file. Keep the window open while using the extension.
REM    Check readiness: open http://127.0.0.1:18080/health in a browser.

set MODEL=Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf
if not exist "%MODEL%" (
  echo Model file not found: %MODEL%
  echo Download it from the mirror URL in the comments at the top of this file.
  pause
  exit /b 1
)

REM v1.2.2: if your build rejects --reasoning off, the manager (start-manager.bat) auto-retries without it; for manual single-model scripts, delete that parameter and re-run (the parameter is kept as-is here, so older builds that need it still work).
llama-server -m "%MODEL%" --alias Qwen3-4B-Instruct-2507 --host 127.0.0.1 --port 18080 -c 1024 -t 4 --reasoning off
REM If your llama-server build does not accept --reasoning off, remove
REM that flag and rerun: this model is non-thinking by design.
pause
