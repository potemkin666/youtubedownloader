@echo off
setlocal enabledelayedexpansion

set "APP_ROOT=%~dp0"
set "APP_ROOT=%APP_ROOT:~0,-1%"

echo [AbyssFetch] Starting...
echo [AbyssFetch] App root: %APP_ROOT%

:: Add bin directory to PATH for yt-dlp and ffmpeg
set "PATH=%APP_ROOT%\bin;%PATH%"

:: Create required directories if they don't exist
if not exist "%APP_ROOT%\portable\logs"  mkdir "%APP_ROOT%\portable\logs"
if not exist "%APP_ROOT%\portable\cache" mkdir "%APP_ROOT%\portable\cache"
if not exist "%APP_ROOT%\downloads"       mkdir "%APP_ROOT%\downloads"
if not exist "%APP_ROOT%\downloads\video" mkdir "%APP_ROOT%\downloads\video"
if not exist "%APP_ROOT%\downloads\audio" mkdir "%APP_ROOT%\downloads\audio"
if not exist "%APP_ROOT%\downloads\shorts" mkdir "%APP_ROOT%\downloads\shorts"
if not exist "%APP_ROOT%\downloads\temp"  mkdir "%APP_ROOT%\downloads\temp"

:: Check if node_modules exists (setup has been run)
if not exist "%APP_ROOT%\node_modules" (
  echo.
  echo [ERROR] node_modules not found.
  echo [ERROR] Please run setup first:
  echo.
  echo   1. Install Node.js from https://nodejs.org
  echo   2. Open a command prompt in this folder
  echo   3. Run: npm install
  echo   4. Then run this script again
  echo.
  pause
  exit /b 1
)

:: Try to launch with local electron
set "ELECTRON_BIN=%APP_ROOT%\node_modules\.bin\electron.cmd"
if exist "%ELECTRON_BIN%" (
  echo [AbyssFetch] Launching with local electron...
  "%ELECTRON_BIN%" "%APP_ROOT%"
  if errorlevel 1 (
    echo [ERROR] Electron exited with an error.
    pause
    exit /b 1
  )
  goto :eof
)

:: Try global electron
where electron >nul 2>&1
if not errorlevel 1 (
  echo [AbyssFetch] Launching with global electron...
  electron "%APP_ROOT%"
  goto :eof
)

echo.
echo [ERROR] Could not find Electron.
echo [ERROR] Run "npm install" in the app directory first.
echo.
pause
exit /b 1

:eof
endlocal
