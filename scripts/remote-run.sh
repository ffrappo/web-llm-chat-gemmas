#!/usr/bin/env bash
# Helper to run the bench suite on a remote server via SSH.
# Supports both Node.js (CPU ONNX) and Python GPU (PyTorch CUDA) runners.
#
# Usage:
#   export GEMMAS_REMOTE=user@your-server-ip
#   export GEMMAS_REMOTE_DIR=/home/user/gemmas
#
#   # Run Node.js suite remotely and stream JSON back
#   ./scripts/remote-run.sh --suite
#
#   # Run GPU-accelerated Python suite on remote CUDA server
#   ./scripts/remote-run.sh --gpu --suite
#
#   # Run reliability with 10 trials
#   ./scripts/remote-run.sh --reliability --trials 10
#
#   # Save results locally
#   ./scripts/remote-run.sh --gpu --suite --output results.json

set -euo pipefail

REMOTE="${GEMMAS_REMOTE:?Environment variable GEMMAS_REMOTE is required (e.g. user@1.2.3.4)}"
REMOTE_DIR="${GEMMAS_REMOTE_DIR:-$HOME/gemmas}"
NODE="${GEMMAS_REMOTE_NODE:-node}"
PYTHON="${GEMMAS_REMOTE_PYTHON:-python3}"

# Separate local --output from remote args
LOCAL_OUTPUT=""
REMOTE_ARGS=()
USE_GPU=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gpu)
      USE_GPU=true
      shift
      ;;
    --output)
      LOCAL_OUTPUT="$2"
      REMOTE_ARGS+=("$1" "/tmp/bench-result.json")
      shift 2
      ;;
    *)
      REMOTE_ARGS+=("$1")
      shift
      ;;
  esac
done

RUNNER="$NODE scripts/bench-node.mjs"
if [[ "$USE_GPU" == true ]]; then
  RUNNER="$PYTHON scripts/bench-gpu.py"
fi

echo "[remote-run] Connecting to $REMOTE …" >&2
echo "[remote-run] Runner: $RUNNER" >&2

# Execute benchmark on remote and stream stdout back
if [[ -n "$LOCAL_OUTPUT" ]]; then
  ssh "$REMOTE" "cd $REMOTE_DIR && $RUNNER ${REMOTE_ARGS[*]} && cat /tmp/bench-result.json" > "$LOCAL_OUTPUT"
  echo "[remote-run] Results saved to $LOCAL_OUTPUT" >&2
else
  ssh "$REMOTE" "cd $REMOTE_DIR && $RUNNER ${REMOTE_ARGS[*]}"
fi
