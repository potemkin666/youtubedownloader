@echo off
setlocal enableextensions enabledelayedexpansion

set "APP_ROOT=%~dp0"
if "%APP_ROOT:~-1%"=="\" set "APP_ROOT=%APP_ROOT:~0,-1%"

title AbyssFetch Launcher
echo [AbyssFetch] Preparing launcher...
echo [AbyssFetch] App root: %APP_ROOT%

set "PATH=%APP_ROOT%\bin;%PATH%"

call :ensure_dirs || exit /b 1
call :ensure_shortcut
call :ensure_node || exit /b 1
call :ensure_dependencies || exit /b 1
call :warn_missing_tools
call :launch || exit /b 1
goto :eof

:ensure_dirs
if not exist "%APP_ROOT%\portable\logs"   mkdir "%APP_ROOT%\portable\logs"
if not exist "%APP_ROOT%\portable\cache"  mkdir "%APP_ROOT%\portable\cache"
if not exist "%APP_ROOT%\downloads"       mkdir "%APP_ROOT%\downloads"
if not exist "%APP_ROOT%\downloads\video" mkdir "%APP_ROOT%\downloads\video"
if not exist "%APP_ROOT%\downloads\audio" mkdir "%APP_ROOT%\downloads\audio"
if not exist "%APP_ROOT%\downloads\shorts" mkdir "%APP_ROOT%\downloads\shorts"
if not exist "%APP_ROOT%\downloads\temp"  mkdir "%APP_ROOT%\downloads\temp"
exit /b 0

:ensure_shortcut
set "SHORTCUT_PATH=%APP_ROOT%\Run AbyssFetch.lnk"
set "ICON_PATH=%APP_ROOT%\assets\icon.ico"

if exist "%SHORTCUT_PATH%" exit /b 0
if not exist "%ICON_PATH%" exit /b 0

set "VBS_FILE=%TEMP%\abyssfetch-shortcut-%RANDOM%%RANDOM%.vbs"
(
  echo Set WshShell = CreateObject("WScript.Shell"^)
  echo Set Shortcut = WshShell.CreateShortcut("%SHORTCUT_PATH%"^)
  echo Shortcut.TargetPath = "%APP_ROOT%\runme.cmd"
  echo Shortcut.WorkingDirectory = "%APP_ROOT%"
  echo Shortcut.IconLocation = "%ICON_PATH%,0"
  echo Shortcut.WindowStyle = 1
  echo Shortcut.Description = "Launch AbyssFetch"
  echo Shortcut.Save
) > "%VBS_FILE%"

cscript //nologo "%VBS_FILE%" >nul 2>&1
del "%VBS_FILE%" >nul 2>&1
exit /b 0

:ensure_node
where npm >nul 2>&1
if not errorlevel 1 exit /b 0

echo.
echo [ERROR] Node.js is required before the launcher can finish setup.
echo [ERROR] Install it once from https://nodejs.org and run `runme.cmd` again.
echo.
pause
exit /b 1

:ensure_dependencies
set "ELECTRON_EXE=%APP_ROOT%\node_modules\electron\dist\electron.exe"
set "ELECTRON_CMD=%APP_ROOT%\node_modules\.bin\electron.cmd"

if exist "%ELECTRON_EXE%" exit /b 0
if exist "%ELECTRON_CMD%" exit /b 0

echo.
echo [AbyssFetch] First launch detected. Installing dependencies automatically...
echo.

pushd "%APP_ROOT%"
call npm install
set "INSTALL_EXIT=%errorlevel%"
popd

if not "%INSTALL_EXIT%"=="0" (
  echo.
  echo [ERROR] Automatic setup failed during `npm install`.
  echo [ERROR] Please fix the npm error above and run `runme.cmd` again.
  echo.
  pause
  exit /b %INSTALL_EXIT%
)

if exist "%ELECTRON_EXE%" exit /b 0
if exist "%ELECTRON_CMD%" exit /b 0

echo.
echo [ERROR] Setup completed, but Electron was still not found.
echo [ERROR] Try running `npm install` manually in this folder.
echo.
pause
exit /b 1

:warn_missing_tools
if exist "%APP_ROOT%\bin\yt-dlp.exe" goto :check_ffmpeg
echo [WARN] Missing bin\yt-dlp.exe - downloads will not work until you add it.

:check_ffmpeg
if exist "%APP_ROOT%\bin\ffmpeg.exe" if exist "%APP_ROOT%\bin\ffprobe.exe" exit /b 0
echo [WARN] Missing ffmpeg.exe and/or ffprobe.exe in bin\ - merges and conversions will not work yet.
exit /b 0

:launch
set "ELECTRON_EXE=%APP_ROOT%\node_modules\electron\dist\electron.exe"
set "ELECTRON_CMD=%APP_ROOT%\node_modules\.bin\electron.cmd"

if exist "%ELECTRON_EXE%" (
  echo [AbyssFetch] Launching app...
  start "" "%ELECTRON_EXE%" "%APP_ROOT%"
  exit /b 0
)

if exist "%ELECTRON_CMD%" (
  echo [AbyssFetch] Launching app...
  "%ELECTRON_CMD%" "%APP_ROOT%"
  exit /b %errorlevel%
)

echo.
echo [ERROR] Could not find Electron after setup.
echo.
pause
exit /b 1
