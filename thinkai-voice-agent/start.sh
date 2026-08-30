#!/bin/bash
# ThinkAI Voice Agent — Single-command launcher for Railway/production
# Starts both the LiveKit agent worker and the FastAPI web server.
# Usage: ./start.sh         (production — "start" mode)
#        ./start.sh dev     (dev mode with hot-reload)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-start}"

echo "🚀 Starting ThinkAI Voice Agent..."
echo "   Environment:  ${APP_ENV:-production}"

# Handle shutdown: kill both processes when this script exits
cleanup() {
    echo "🛑 Shutting down..."
    kill $AGENT_PID $WEB_PID 2>/dev/null || true
    wait $AGENT_PID $WEB_PID 2>/dev/null || true
    echo "Done."
}
trap cleanup EXIT INT TERM

# Start the agent worker in the background (skip on staging)
if [ "${APP_ENV:-production}" != "staging" ]; then
    echo "   Agent worker: python server.py $MODE"
    NO_COLOR=1 python3 server.py "$MODE" &
    AGENT_PID=$!
else
    echo "   Agent worker: ⏭️  kihagyva (staging)"
    AGENT_PID=""
fi

echo "   Web server:   python web_server.py (port ${PORT:-8000})"

# Start the web server in the background
python3 web_server.py &
WEB_PID=$!

if [ -n "$AGENT_PID" ]; then
    echo "✅ Both processes started (agent=$AGENT_PID, web=$WEB_PID)"
    wait $AGENT_PID $WEB_PID
else
    echo "✅ Web server started (web=$WEB_PID, staging — no agent)"
    wait $WEB_PID
fi
