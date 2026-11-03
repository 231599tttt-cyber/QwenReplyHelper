#!/bin/sh
# QwenReplyHelper - Model B: old Qwen3.5-4B local service starter (macOS / Linux)
# Run this on YOUR OWN computer. No VPS, no cloud.
# This is the SECOND service: one llama-server loads only one model.
# Model A (new, default) runs on port 8080 via start-qwen.sh.
# Model B (old 4B) runs on port 8081 via THIS file.
# Normally run only ONE at a time: close the other terminal first,
# because running both at once uses much more RAM.
# 1) Put llama-server (plus its libraries from the same release folder)
#    in this folder (or on PATH), e.g. chmod +x llama-server
# 2) Download the model GGUF from the mirror below into this folder.
#    Model: Qwen3.5-4B Q4_K_M
#    URL: https://hf-mirror.com/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/main/Qwen_Qwen3.5-4B-Q4_K_M.gguf
#    Size: 3013027808 bytes (about 3.01 GB)
#    SHA256: 13c16f426047e2de38cd075bdade4a7bcbc8c774384876f677740cda65f8a983
#    Verify with: shasum -a 256 Qwen3.5-4B-Q4_K_M.gguf
#    Model page: https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/tree/main
#    Mirror page: https://hf-mirror.com/bartowski/Qwen_Qwen3.5-4B-GGUF/tree/main
# 3) Run: sh start-qwen-35-4b.sh   (keep the terminal open while using Model B)
#    Check readiness: open http://127.0.0.1:8081/health in a browser.
set -e
MODEL="Qwen_Qwen3.5-4B-Q4_K_M.gguf"
if [ ! -f "$MODEL" ]; then
  echo "Model file not found: $MODEL"
  echo "Download it from the mirror URL in the comments at the top of this file."
  exit 1
fi
# If your llama-server build does not accept --reasoning off, remove that
# flag and rerun: Chrome mode keeps thinking off for speed.
# v1.2.2: if your build rejects --reasoning off, the manager (start-manager.sh) auto-retries without it; for manual single-model scripts, delete that parameter and re-run (the parameter is kept as-is here, so older builds that need it still work).
./llama-server -m "$MODEL" --alias Qwen3.5-4B --host 127.0.0.1 --port 8081 -c 1024 -t 4 --reasoning off
