#!/bin/bash
echo "==================================================="
echo "  CDE (Chrome Downloader Extension) - Server Startup"
echo "==================================================="
cd desktop_app/api || exit

if [ ! -d "venv" ]; then
    echo "[1/3] Creating virtual environment..."
    python3 -m venv venv
else
    echo "[1/3] Virtual environment found."
fi

echo "[2/3] Activating environment and checking dependencies..."
source venv/bin/activate
pip install -r requirements.txt --quiet

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "[Warning] ffmpeg is not installed. You might need it for merging videos."
    echo "You can install it using: sudo apt install ffmpeg (Ubuntu/Debian) or brew install ffmpeg (Mac)"
fi

echo "[3/3] Starting Local API Server on Port 8000..."
echo "You can now use the Chrome Extension!"
echo "Keep this window open. Press Ctrl+C to stop."
echo "==================================================="
python -m uvicorn main:app --reload --port 8000
