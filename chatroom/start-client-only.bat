@echo off
echo ========================================
echo   Agent Chat Room - Client Only
echo ========================================
echo.

cd /d "%~dp0\client"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing client dependencies...
    call npm install
    echo.
)

echo Starting client on http://localhost:5173
echo Make sure the server is running on port 3001!
echo Press Ctrl+C to stop
echo ========================================
echo.

call npm run dev
