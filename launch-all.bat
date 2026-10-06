@echo off
setlocal
echo ======================================================
echo   Synthograsizer + Daydream Scope - Launching Both
echo ======================================================
echo.
echo   Synthograsizer  -^>  http://127.0.0.1:8000
echo   Daydream Scope  -^>  http://127.0.0.1:7860
echo.

:: Daydream Scope lives outside this repo. Set DAYDREAM_SCOPE_DIR to point at
:: it; the old hard-coded C:\Users\Alexander\CascadeProjects\... path broke
:: when the projects folder was renamed, and cd failing there left this script
:: running start.bat from the wrong directory.
if "%DAYDREAM_SCOPE_DIR%"=="" set "DAYDREAM_SCOPE_DIR=%USERPROFILE%\Projects\DayDreamScope"

if exist "%DAYDREAM_SCOPE_DIR%" (
    echo Starting Daydream Scope from %DAYDREAM_SCOPE_DIR% ...
    start "Daydream Scope" cmd /k "cd /d "%DAYDREAM_SCOPE_DIR%" && uv run daydream-scope --port 7860 --no-browser"
    :: Brief pause so Scope begins initializing
    timeout /t 2 /nobreak > nul
) else (
    echo Skipping Daydream Scope: not found at %DAYDREAM_SCOPE_DIR%
    echo   set DAYDREAM_SCOPE_DIR to its location to launch it too.
    echo.
)

:: Start Synthograsizer (ChatRoom on 3001 + FastAPI on 8000) in this window.
:: %~dp0 is this script's own folder, so the suite starts wherever the repo is.
echo Starting Synthograsizer...
cd /d "%~dp0"
call start.bat

endlocal
