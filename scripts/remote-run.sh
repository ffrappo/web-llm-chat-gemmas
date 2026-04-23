#!/usr/bin/env bash
# Helper to run the Node.js bench suite on a remote server via SSH.
#
# Usage:
#   export GEMMAS_REMOTE=user@your-server-ip
#   export GEMMAS_REMOTE_DIR=/home/user/gemmas
#
#   # Run suite remotely and stream JSON back to local stdout
#   ./scripts/remote-run.sh --suite
#
#   # Run reliability with 10 trials
#   ./scripts/remote-run.sh --reliability --trials 10
#
#   # Run with custom config
#   ./scripts/remote-run.sh --suite --config-json '{"temperature":1.1}'
#
#   # Save results locally
#   ./scripts/remote-run.sh --reliability --trials 10 --output results.json

set -euo pipefail

REMOTE="${GEMMAS_REMOTE:?Environment variable GEMMAS_REMOTE is required (e.g. user@1.2.3.4)}"
REMOTE_DIR="${GEMMAS_REMOTE_DIR:-$HOME/gemmas}"
NODE="${GEMMAS_REMOTE_NODE:-node}"

# Separate local --output from remote args
LOCAL_OUTPUT=""
REMOTE_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
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

echo "[remote-run] Connecting to $REMOTE …" >&2

# Sync local changes to remote (optional but handy)
# Uncomment the next two lines if you want auto-sync before every run:
# echo "[remote-run] Syncing repo to remote …" >&2
# rsync -az --exclude node_modules --exclude .next --exclude .git . "$REMOTE:$REMOTE_DIR/"

# Execute benchmark on remote and stream stdout back
if [[ -n "$LOCAL_OUTPUT" ]]; then
  ssh "$REMOTE" "cd $REMOTE_DIR && $NODE scripts/bench-node.mjs ${REMOTE_ARGS[*]} && cat /tmp/bench-result.json" > "$LOCAL_OUTPUT"
  echo "[remote-run] Results saved to $LOCAL_OUTPUT" >&2
else
  ssh "$REMOTE" "cd $REMOTE_DIR && $NODE scripts/bench-node.mjs ${REMOTE_ARGS[*]}"
fi
