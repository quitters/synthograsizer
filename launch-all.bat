@echo off
echo ======================================================
echo   Synthograsizer + Daydream Scope - Launching Both
echo ======================================================
echo.
echo   Synthograsizer  -^>  http://127.0.0.1:8001
echo   Daydream Scope  -^>  http://127.0.0.1:7860
echo.

:: Start Daydream Scope in a new window on port 7860
echo Starting Daydream Scope...
start "Daydream Scope" cmd /k "cd /d C:\Users\Alexander\CascadeProjects\DayDreamScope && uv run daydream-scope --port 7860 --no-browser"

:: Brief pause so Scope begins initializing
timeout /t 2 /nobreak > nul

:: Start Synthograsizer (ChatRoom on 3001 + FastAPI on 8001) in this window
echo Starting Synthograsizer...
cd /d C:\Users\Alexander\CascadeProjects\synthograsizer-suite
call start.bat
