#!/bin/bash
# OpenSPC Frontend Startup Script (Unix/Mac/Git Bash)

echo "========================================"
echo "  OpenSPC Frontend Startup"
echo "========================================"
echo

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: npm install failed"
        exit 1
    fi
    echo
fi

echo "Starting development server..."
echo "Frontend will be available at http://localhost:5173"
echo "Press Ctrl+C to stop"
echo

npm run dev
