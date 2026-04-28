#!/usr/bin/env bash
# Polymarket Paper Trader — Backend Launcher
set -e

echo ""
echo "  ██████╗  ██████╗ ██╗  ██╗   ██╗███╗   ███╗ █████╗ ██████╗ ██╗  ██╗███████╗████████╗"
echo "  ██╔══██╗██╔═══██╗██║  ╚██╗ ██╔╝████╗ ████║██╔══██╗██╔══██╗██║ ██╔╝██╔════╝╚══██╔══╝"
echo "  ██████╔╝██║   ██║██║   ╚████╔╝ ██╔████╔██║███████║██████╔╝█████╔╝ █████╗     ██║   "
echo "  ██╔═══╝ ██║   ██║██║    ╚██╔╝  ██║╚██╔╝██║██╔══██║██╔══██╗██╔═██╗ ██╔══╝     ██║   "
echo "  ██║     ╚██████╔╝███████╗██║   ██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██╗███████╗   ██║   "
echo "  ╚═╝      ╚═════╝ ╚══════╝╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   "
echo ""
echo "  Paper Trading Backend  •  Real-time Polymarket Prices"
echo "  ─────────────────────────────────────────────────────"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "  ✗ Python 3 not found. Please install Python 3.9+"
  exit 1
fi

echo "  → Installing dependencies..."
pip3 install -q -r requirements.txt

echo "  → Starting background scanner worker..."
python3 scripts/scanner_worker.py > scanner.log 2>&1 &

echo "  → Starting server on http://localhost:8888"
echo "  → WebSocket endpoint: ws://localhost:8888/ws/{session_id}"
echo "  → Health check:       http://localhost:8888/health"
echo ""
echo "  Open the frontend app in your browser, or connect to ws://localhost:8888/ws/demo"
echo ""

uvicorn scripts.main:app --host 0.0.0.0 --port 8888 --reload
