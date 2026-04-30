@echo off
REM Zero Training Video Generator — one-shot GitHub Pages deploy (Windows).
REM
REM Same script as deploy.command, ported to batch.
REM Requires: git, gh (GitHub CLI). Install gh from https://cli.github.com

setlocal
cd /d "%~dp0"

set REPO_NAME=zero-training-video-generator
set REPO_DESC=Zero Training Video Generator - AI-powered concept training videos. Framework-driven script, ElevenLabs voice, GSAP-animated single-file HTML output.

cls
echo.
echo   =========================================================
echo    Zero Training Video Generator
echo    Deploy to GitHub Pages
echo   =========================================================
echo.

REM ---- 1. Pre-flight ------------------------------------------------------
where git >nul 2>nul || (
  echo   X git not found. Install from https://git-scm.com
  pause & exit /b 1
)
echo    git found

where gh >nul 2>nul || (
  echo.
  echo   X GitHub CLI (gh) not found.
  echo     Install: https://cli.github.com
  echo     Then re-run this script.
  pause & exit /b 1
)
echo    gh found

gh auth status >nul 2>nul || (
  echo.
  echo   You're not logged in to GitHub via gh. Running gh auth login...
  echo.
  gh auth login
)
echo    gh authenticated

for /f "delims=" %%i in ('gh api user --jq ".login"') do set GH_USER=%%i
echo      GitHub user: %GH_USER%
echo.

REM ---- 2. Git init --------------------------------------------------------
if not exist ".git" (
  git init -b main >nul
  echo    git repo initialized
) else (
  echo    git repo already exists
)

git config user.email >nul 2>nul || (
  git config user.email "social@z-ro.co"
  git config user.name  "Zero"
)

git add -A
git diff --cached --quiet
if errorlevel 1 (
  for /f %%i in ('powershell -Command "Get-Date -Format yyyy-MM-ddTHH:mm:ssZ"') do set NOW=%%i
  git commit -m "Deploy: %NOW%" >nul
  echo    committed local changes
) else (
  echo    no local changes to commit
)

REM ---- 3. Repo create or reuse --------------------------------------------
gh repo view "%GH_USER%/%REPO_NAME%" >nul 2>nul
if %errorlevel% == 0 (
  echo    repo already exists - will push to it
  git remote get-url origin >nul 2>nul || git remote add origin "https://github.com/%GH_USER%/%REPO_NAME%.git"
) else (
  echo      Creating GitHub repo: %GH_USER%/%REPO_NAME%
  gh repo create "%REPO_NAME%" --public --description "%REPO_DESC%" --source=. --remote=origin --push
  echo    repo created
)

REM ---- 4. Push ------------------------------------------------------------
git remote get-url origin >nul 2>nul && (
  echo      Pushing to origin/main...
  git push -u origin main
  echo    push complete
)

REM ---- 5. Enable Pages ----------------------------------------------------
echo      Enabling GitHub Pages...
gh api -X POST "/repos/%GH_USER%/%REPO_NAME%/pages" -f source.branch=main -f source.path=/ >nul 2>nul
if errorlevel 1 (
  gh api -X PUT "/repos/%GH_USER%/%REPO_NAME%/pages" -f source.branch=main -f source.path=/ >nul 2>nul
)
echo    Pages enabled

REM ---- 6. Done ------------------------------------------------------------
echo.
echo   ----------------------------------------------
echo.
echo   Live URL: https://%GH_USER%.github.io/%REPO_NAME%/
echo.
echo   First deploy can take 1-3 minutes to propagate.
echo   Re-run this script any time to push updates.
echo.
echo   Note about Kimi (Ollama): GitHub Pages is static-only,
echo   so the Ollama proxy isn't available there. On the live
echo   URL, use Claude or Gemini. For Kimi, run locally with
echo   run.bat (Node mode) - the proxy works there.
echo.
pause
endlocal
