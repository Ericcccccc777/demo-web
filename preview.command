#!/bin/sh
# Double-click to preview the showcase locally (macOS). Press Ctrl+C in this window to stop.
cd "$(dirname "$0")"
PORT=8080
( sleep 1; open "http://localhost:$PORT/" ) &
echo "Showcase running at http://localhost:$PORT/  (中文版: http://localhost:$PORT/zh/)"
python3 -m http.server "$PORT" -d site
