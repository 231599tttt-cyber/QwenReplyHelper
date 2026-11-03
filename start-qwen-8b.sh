#!/bin/sh
# QwenReplyHelper - Model C: Qwen3-8B local service starter (macOS / Linux)
# Backup only. Daily use: sh start-manager.sh once; the manager owns
# llama-server and switches models with one tap.
# Run this on YOUR OWN computer. No VPS, no cloud.
# Model C (8B) runs on port 8082 via THIS file.
# Model A (new, default) runs on port 8080 via start-qwen.sh.
# Model B (old 4B) runs on port 8081 via start-qwen-35-4b.sh.
# Normally run only ONE at a time: close the other terminal first,
# because running several models at once uses much more RAM.
# 1) Put llama-server (plus its libraries from the same release folder)
#    in this folder (or on PATH), e.g. chmod +x llama-server
# 2) Download the model GGUF into this folder.
#    Model: Qwen3-8B Q4_K_M (recommended, about 5.03 GB)
#    Original: Qwen/Qwen3-8B, bartowski repo bartowski/Qwen_Qwen3-8B-GGUF
#    Qwen released no separate Qwen3-8B-Instruct-2507, so this is the
#    original Qwen3-8B, forced --reasoning off for Chrome speed.
#    Model page: https://huggingface.co/bartowski/Qwen_Qwen3-8B-GGUF/tree/main
#    Mirror page: https://hf-mirror.com/bartowski/Qwen_Qwen3-8B-GGUF/tree/main
#    Recommended file: Qwen_Qwen3-8B-Q4_K_M.gguf (also accepted without the Qwen_ prefix).
#    Alternatives, larger/slower: Q5_K_M about 5.85 GB, Q8_0 about 8.71 GB.
#    This script tries, in order: Q4_K_M, Q5_K_M, Q8_0, each with and
#    without the Qwen_ prefix, and uses the first file that exists.
# 3) Run: sh start-qwen-8b.sh   (keep the terminal open while using Model C)
#    Check readiness: open http://127.0.0.1:8082/health in a browser.
set -e
MODEL="Qwen_Qwen3-8B-Q4_K_M.gguf"
if [ ! -f "$MODEL" ]; then
  echo "Model file not found: $MODEL"
  echo "Download it from the model page in the comments at the top of this file."
  exit 1
fi
echo "Using model file: $MODEL"
# If your llama-server build does not accept --reasoning off, remove that
# flag and rerun: Chrome mode keeps thinking off for speed.
# v1.2.2: if your build rejects --reasoning off, the manager (start-manager.sh) auto-retries without it; for manual single-model scripts, delete that parameter and re-run (the parameter is kept as-is here, so older builds that need it still work).
./llama-server -m "$MODEL" --alias Qwen3-8B --host 127.0.0.1 --port 8082 -c 1024 -t 4 --reasoning off
