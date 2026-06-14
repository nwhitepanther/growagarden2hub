@echo off
cd /d "%~dp0server"
echo Starting Grow a Garden 2 Hub server...
echo Open http://127.0.0.1:3000/signup.html in your browser.
echo.

where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
) else (
  set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if exist "%BUNDLED_NODE%" (
    "%BUNDLED_NODE%" server.js
  ) else (
    echo Node.js was not found. Install Node.js or add it to your PATH.
  )
)
pause
