#!/bin/sh
# QwenReplyHelper - Model A (new, default) local service starter (macOS / Linux)
# Model B (old 4B, port 8081) uses start-qwen-35-4b.sh instead.
# Run this on YOUR OWN computer. No VPS, no cloud.
# 1) Download llama-server from a llama.cpp release and put it in this
#    folder (or on PATH), e.g. chmod +x llama-server
# 2) Download the model GGUF from the mirror below into this folder.
#    Model: Qwen3-4B-Instruct-2507 Q4_K_M
#    URL: https://hf-mirror.com/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf
#    Size: 2497280736 bytes (about 2.50 GB)
#    SHA256: 2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e
#    Verify with: shasum -a 256 Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf
# 3) Run: sh start-qwen.sh   (keep the terminal open while using the extension)
#    Check readiness: open http://127.0.0.1:8080/health in a browser.
set -e
MODEL="Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
if [ ! -f "$MODEL" ]; then
  echo "Model file not found: $MODEL"
  echo "Download it from the mirror URL in the comments at the top of this file."
  exit 1
fi
# If your llama-server build does not accept --reasoning off, remove that
# flag and rerun: this model is non-thinking by design.
# v1.2.2: if your build rejects --reasoning off, the manager (start-manager.sh) auto-retries without it; for manual single-model scripts, delete that parameter and re-run (the parameter is kept as-is here, so older builds that need it still work).
./llama-server -m "$MODEL" --alias Qwen3-4B-Instruct-2507 --host 127.0.0.1 --port 8080 -c 1024 -t 4 --reasoning off
