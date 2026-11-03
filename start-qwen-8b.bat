@echo off
REM QwenReplyHelper - Model C: Qwen3-8B local service starter (Windows)
REM Backup only. Daily use: double-click start-manager.bat once; the
REM manager owns llama-server and switches models with one tap.
REM This script is for when the manager is not running.
REM Run this on YOUR OWN computer. No VPS, no cloud.
REM Model C (8B) runs on port 18082 via THIS file.
REM Model A (new, default) runs on port 18080 via start-qwen.bat.
REM Model B (old 4B) runs on port 18081 via start-qwen-35-4b.bat.
REM Normally run only ONE at a time: close the other black window first,
REM because running several models at once uses much more RAM.
REM 1) Put llama-server.exe (plus its DLLs from the same release folder)
REM    in this folder (or on PATH).
REM 2) Download the model GGUF into this folder.
REM    Model: Qwen3-8B Q4_K_M (recommended, about 5.03 GB)
REM    Original: Qwen/Qwen3-8B, bartowski repo bartowski/Qwen_Qwen3-8B-GGUF
REM    Qwen released no separate Qwen3-8B-Instruct-2507, so this is the
REM    original Qwen3-8B, forced --reasoning off for Chrome speed.
REM    Model page (click the file, then Download):
REM    https://huggingface.co/bartowski/Qwen_Qwen3-8B-GGUF/tree/main
REM    Mirror page: https://hf-mirror.com/bartowski/Qwen_Qwen3-8B-GGUF/tree/main
REM    Recommended file: Qwen_Qwen3-8B-Q4_K_M.gguf (also accepted without the Qwen_ prefix).
REM    Alternatives, larger/slower: Q5_K_M about 5.85 GB, Q8_0 about 8.71 GB.
REM    This script tries, in order: Q4_K_M, Q5_K_M, Q8_0, each with and
REM    without the Qwen_ prefix, and uses the first file that exists.
REM    Verify with: certutil -hashfile <filename> SHA256
REM 3) Double-click this file. Keep the window open while using Model C.
REM    Check readiness: open http://127.0.0.1:18082/health in a browser.

set MODEL=Qwen_Qwen3-8B-Q4_K_M.gguf
if not exist "%MODEL%" (
  echo Model file not found: %MODEL%
  echo Download it from the model page in the comments at the top of this file.
  pause
  exit /b 1
)
echo Using model file: %MODEL%

REM v1.2.2: if your build rejects --reasoning off, the manager (start-manager.bat) auto-retries without it; for manual single-model scripts, delete that parameter and re-run (the parameter is kept as-is here, so older builds that need it still work).
llama-server -m "%MODEL%" --alias Qwen3-8B --host 127.0.0.1 --port 18082 -c 1024 -t 4 --reasoning off
REM If your llama-server build does not accept --reasoning off, remove
REM that flag and rerun: Chrome mode keeps thinking off for speed.
pause
