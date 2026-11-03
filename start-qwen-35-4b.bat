@echo off
REM QwenReplyHelper - Model B: old Qwen3.5-4B local service starter (Windows)
REM Run this on YOUR OWN computer. No VPS, no cloud.
REM This is the SECOND service: one llama-server loads only one model.
REM Model A (new, default) runs on port 8080 via start-qwen.bat.
REM Model B (old 4B) runs on port 8081 via THIS file.
REM Normally run only ONE at a time: close the other black window first,
REM because running both at once uses much more RAM.
REM 1) Put llama-server.exe (plus its DLLs from the same release folder)
REM    in this folder (or on PATH).
REM 2) Download the model GGUF from the mirror below into this folder.
REM    Model: Qwen3.5-4B Q4_K_M
REM    URL: https://hf-mirror.com/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/main/Qwen_Qwen3.5-4B-Q4_K_M.gguf
REM    Size: 3013027808 bytes (about 3.01 GB)
REM    SHA256: 13c16f426047e2de38cd075bdade4a7bcbc8c774384876f677740cda65f8a983
REM    Verify with: certutil -hashfile Qwen3.5-4B-Q4_K_M.gguf SHA256
REM    Model page (click the file, then Download):
REM    https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/tree/main
REM    Mirror page: https://hf-mirror.com/bartowski/Qwen_Qwen3.5-4B-GGUF/tree/main
REM 3) Double-click this file. Keep the window open while using Model B.
REM    Check readiness: open http://127.0.0.1:8081/health in a browser.

set MODEL=Qwen_Qwen3.5-4B-Q4_K_M.gguf
if not exist "%MODEL%" (
  echo Model file not found: %MODEL%
  echo Download it from the mirror URL in the comments at the top of this file.
  pause
  exit /b 1
)

REM v1.2.2: if your build rejects --reasoning off, the manager (start-manager.bat) auto-retries without it; for manual single-model scripts, delete that parameter and re-run (the parameter is kept as-is here, so older builds that need it still work).
llama-server -m "%MODEL%" --alias Qwen3.5-4B --host 127.0.0.1 --port 8081 -c 1024 -t 4 --reasoning off
REM If your llama-server build does not accept --reasoning off, remove
REM that flag and rerun: Chrome mode keeps thinking off for speed.
pause
