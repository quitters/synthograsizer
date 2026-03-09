@echo off
echo ========================================
echo   Agent Chat Room - Starting Server
echo ========================================
echo.

cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm run install-all
    echo.
)

echo Starting server and client...
echo.
echo Server will run on: http://localhost:3001
echo Client will run on: http://localhost:5173
echo.
echo Press Ctrl+C to stop
echo ========================================
echo.

call npm run dev
