@echo off
echo ===================================================
echo   Photo ^& Video CDE - Server Startup
echo ===================================================
cd desktop_app\api

if not exist venv (
    echo [1/3] Creating virtual environment...
    python -m venv venv
) else (
    echo [1/3] Virtual environment found.
)

echo [2/3] Activating environment and checking dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt --quiet

echo [3/3] Starting Local API Server on Port 8000...
echo You can now use the Chrome Extension!
echo Keep this window open. Press Ctrl+C to stop.
echo ===================================================
python -m uvicorn main:app --reload --port 8000

pause
