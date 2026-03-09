@echo off
echo ======================================
echo   Synthograsizer Suite - Starting...
echo ======================================
echo.

:: Install Python dependencies
pip install -r requirements.txt --quiet

:: Start ChatRoom Node.js backend (port 3001)
echo Starting ChatRoom backend on port 3001...
cd chatroom
start /B node server/index.js
cd ..

:: Start FastAPI server (port 8000) — serves all pages + proxies ChatRoom API
echo Starting FastAPI server at http://127.0.0.1:8000
python -m backend.server
