@echo off
REM zero · video generator — Windows launcher
REM
REM Double-click this file. It will:
REM   1. Start a local server on port 8000 (Node preferred — gives Ollama
REM      proxy support; falls back to Python if Node isn't installed,
REM      with no Ollama support in that case).
REM   2. Open the dashboard in your default browser.
REM   3. Keep running. Close this window to stop the server.

cd /d "%~dp0"

set PORT=8000

cls
echo.
echo   =========================================================
echo    zero - video generator
echo    local preview server
echo   =========================================================
echo.
echo   Folder:  %CD%
echo   URL:     http://localhost:%PORT%
echo.
echo   Opening browser...
echo   (To stop the server: close this window or press Ctrl+C)
echo.

REM Try Chrome first, fall back to default browser
start chrome "http://localhost:%PORT%" 2>nul
if errorlevel 1 start "" "http://localhost:%PORT%"

REM Prefer Node (gives the Ollama Cloud proxy). Falls back to Python.
where node >nul 2>nul
if %errorlevel% == 0 (
  node server.js --port=%PORT%
  goto :end
)

echo   Node not found. Falling back to Python (no Kimi/Ollama support).
echo   Install Node from https://nodejs.org to enable Kimi.
echo.

where python3 >nul 2>nul
if %errorlevel% == 0 (
  python3 -m http.server %PORT%
  goto :end
)

where python >nul 2>nul
if %errorlevel% == 0 (
  python -m http.server %PORT%
  goto :end
)

where py >nul 2>nul
if %errorlevel% == 0 (
  py -m http.server %PORT%
  goto :end
)

echo.
echo   X Couldn't find Node 18+ or Python on your system.
echo     Install Node from https://nodejs.org (recommended) or
echo     Python from https://www.python.org.
echo.
pause

:end
