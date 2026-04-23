#!/usr/bin/env bash
# Remote server setup for headless Gemma 4 benchmarking.
# Run this on the rented server (Ubuntu/Debian).
#
#   curl -fsSL https://raw.githubusercontent.com/fornacestudio/gemmas/main/scripts/remote-setup.sh | bash
#   # or after cloning:
#   bash scripts/remote-setup.sh

set -euo pipefail

echo "=== Gemmas Remote Setup ==="

# ---------------------------------------------------------------------------
# 1. System deps
# ---------------------------------------------------------------------------
echo "[1/6] Installing system dependencies..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq \
  git \
  curl \
  ca-certificates \
  build-essential \
  python3 \
  python3-pip \
  htop \
  tmux \
  unzip \
  jq

# ---------------------------------------------------------------------------
# 2. Node.js (via NodeSource)
# ---------------------------------------------------------------------------
echo "[2/6] Installing Node.js 22.x..."
if ! command -v node &>/dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi

node -v
npm -v

# ---------------------------------------------------------------------------
# 3. Python GPU deps
# ---------------------------------------------------------------------------
echo "[3/6] Installing Python dependencies for GPU bench..."
pip install --quiet --upgrade pip
pip install --quiet transformers accelerate bitsandbytes

# ---------------------------------------------------------------------------
# 4. Clone repo (if not already present)
# ---------------------------------------------------------------------------
echo "[4/6] Preparing project directory..."
REPO_DIR="${REPO_DIR:-$HOME/gemmas}"
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone https://github.com/fornacestudio/gemmas.git "$REPO_DIR"
fi
cd "$REPO_DIR"

# ---------------------------------------------------------------------------
# 5. Install Node dependencies
# ---------------------------------------------------------------------------
echo "[5/6] Installing npm dependencies..."
npm ci --prefer-offline --no-audit --no-fund

# ---------------------------------------------------------------------------
# 6. Warm-up model cache (optional but recommended)
# ---------------------------------------------------------------------------
echo "[6/6] Pre-downloading Gemma 4 ONNX model weights..."
node scripts/bench-node.mjs --prompt "Reply with exactly OK." --no-warmup --output /dev/null 2>/dev/null || true

echo ""
echo "=== Setup complete ==="
echo "Project directory: $REPO_DIR"
echo ""
echo "Quick start (CPU / ONNX):"
echo "  cd $REPO_DIR"
echo "  node scripts/bench-node.mjs --suite"
echo ""
echo "Quick start (GPU / PyTorch CUDA):"
echo "  cd $REPO_DIR"
echo "  python3 scripts/bench-gpu.py --suite"
