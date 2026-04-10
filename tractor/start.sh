#!/bin/bash
# Kill any existing node processes on ports 3000/3001, then start dev server
echo "Stopping existing processes..."
cmd.exe /c "taskkill /F /IM node.exe" 2>/dev/null
sleep 2
echo "Starting dev server..."
cd "$(dirname "$0")"
exec npm run dev
