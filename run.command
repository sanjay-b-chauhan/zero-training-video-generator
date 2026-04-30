#!/usr/bin/env bash
# zero · video generator — Mac launcher
#
# Double-click this file in Finder. It will:
#   1. Start a local server on port 8000 (Node preferred — gives Ollama
#      proxy support; falls back to Python if Node isn't installed,
#      with no Ollama support in that case).
#   2. Open the dashboard in Chrome (or your default browser).
#   3. Keep running. Close this Terminal window to stop the server.

set -e
cd "$(dirname "$0")"

PORT=8000

# Kill any process already on the port (so re-launching doesn't fail)
if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  echo "Port $PORT is in use — stopping the previous server first."
  lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

clear
cat <<'EOF'

  ╔══════════════════════════════════════════════════════════╗
  ║   zero · video generator                                 ║
  ║   local preview server                                   ║
  ╚══════════════════════════════════════════════════════════╝

EOF

echo "  Folder:  $(pwd)"
echo "  URL:     http://localhost:$PORT"
echo ""
echo "  Opening Chrome..."
echo "  (To stop the server: close this window or press Ctrl+C)"
echo ""

# Open in Chrome if available, else default browser
if [ -d "/Applications/Google Chrome.app" ]; then
  ( sleep 1.2 && open -a "Google Chrome" "http://localhost:$PORT" ) &
else
  ( sleep 1.2 && open "http://localhost:$PORT" ) &
fi

# Prefer Node — gives us the Ollama Cloud proxy. Fall back to python
# only if Node isn't available (in which case Kimi/Ollama won't work
# because of CORS, but Claude / Gemini / Mock all still do).
if command -v node >/dev/null 2>&1; then
  NODE_VER_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo "0")
  if [ "$NODE_VER_MAJOR" -ge 18 ]; then
    PORT=$PORT exec node server.js --port=$PORT
  fi
  echo "  ⚠  Node is installed but older than v18 — Ollama proxy needs"
  echo "     the built-in fetch (Node 18+). Falling back to python."
  echo "     Install a newer Node from https://nodejs.org if you want Kimi."
  echo ""
fi

if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server $PORT
elif command -v python >/dev/null 2>&1; then
  python -m SimpleHTTPServer $PORT
else
  echo ""
  echo "  ✗ Couldn't find Node 18+ or Python on your system."
  echo "    Install Node from https://nodejs.org (recommended — enables Kimi)"
  echo "    or Python from https://www.python.org (no Kimi support)."
  echo ""
  read -p "  Press Enter to close this window..."
fi
