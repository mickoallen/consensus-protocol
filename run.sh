#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# Check for wails CLI
if ! command -v wails &> /dev/null; then
    echo "==> Installing Wails CLI..."
    go install github.com/wailsapp/wails/v2/cmd/wails@latest
fi

echo "==> Building and launching Consensus Protocol..."
wails dev
