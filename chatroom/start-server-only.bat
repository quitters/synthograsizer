@echo off
echo ========================================
echo   Agent Chat Room - Server Only
echo ========================================
echo.

cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting server on http://localhost:3001
echo Press Ctrl+C to stop
echo ========================================
echo.

call npm run server
