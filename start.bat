@echo off
setlocal
echo ======================================
echo   Synthograsizer Suite - Starting...
echo ======================================
echo.

:: Run from this script's own directory, so it works regardless of where it
:: was invoked from (launch-all.bat used to cd to a path that no longer exists).
cd /d "%~dp0"

:: Install Python dependencies
echo Checking Python dependencies...
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo.
    echo ERROR: pip install failed. The FastAPI server will not start.
    echo Run "pip install -r requirements.txt" on its own to see why.
    pause
    exit /b 1
)

:: The chatroom depends on ../workflow-engine via a "file:" link in
:: package.json. That link is a junction, and it does not survive the repo
:: being copied or moved — leaving an EMPTY node_modules\workflow-engine and a
:: server that dies instantly on import. Check for it explicitly rather than
:: letting the failure disappear into a backgrounded process.
if not exist "chatroom\node_modules\workflow-engine\index.js" (
    echo Linking chatroom dependencies ^(workflow-engine link missing^)...
    if exist "chatroom\node_modules\workflow-engine" rmdir "chatroom\node_modules\workflow-engine"
    pushd chatroom
    call npm install
    popd
    if not exist "chatroom\node_modules\workflow-engine\index.js" (
        echo.
        echo ERROR: could not link workflow-engine. Run "npm install" in chatroom\.
        pause
        exit /b 1
    )
)

:: Start ChatRoom Node.js backend (port 3001).
:: Logged to chatroom\server.log — this used to run with /B and no redirect,
:: so a crash on startup was completely silent and the suite just half-worked.
echo Starting ChatRoom backend on port 3001 ^(log: chatroom\server.log^)...
pushd chatroom
start /B cmd /c "node server/index.js > server.log 2>&1"
popd

:: Start FastAPI server (port 8000) - serves all pages + proxies ChatRoom API
echo Starting FastAPI server at http://127.0.0.1:8000
echo.
python -m backend.server

endlocal
