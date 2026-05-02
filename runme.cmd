@echo off
setlocal enableextensions enabledelayedexpansion

set "APP_ROOT=%~dp0"
if "%APP_ROOT:~-1%"=="\" set "APP_ROOT=%APP_ROOT:~0,-1%"
set "SHORTCUT_PATH=%APP_ROOT%\Run AbyssFetch.lnk"
set "ICON_PATH=%APP_ROOT%\assets\icon.ico"
set "ELECTRON_EXE=%APP_ROOT%\node_modules\electron\dist\electron.exe"
set "ELECTRON_CMD=%APP_ROOT%\node_modules\.bin\electron.cmd"

title AbyssFetch Launcher
echo [AbyssFetch] Preparing launcher...
echo [AbyssFetch] App root: %APP_ROOT%

set "PATH=%APP_ROOT%\bin;%PATH%"

call :ensure_dirs || exit /b 1
call :ensure_node || exit /b 1
call :ensure_dependencies || exit /b 1
call :ensure_shortcut
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
if exist "%SHORTCUT_PATH%" exit /b 0
if not exist "%ICON_PATH%" exit /b 0

:next_temp_file
set "TEMP_TOKEN=%DATE%_%TIME%_%RANDOM%"
set "TEMP_TOKEN=%TEMP_TOKEN:/=%"
set "TEMP_TOKEN=%TEMP_TOKEN:-=%"
set "TEMP_TOKEN=%TEMP_TOKEN::=%"
set "TEMP_TOKEN=%TEMP_TOKEN:.=%"
set "TEMP_TOKEN=%TEMP_TOKEN:,=%"
set "TEMP_TOKEN=%TEMP_TOKEN: =0%"
set "VBS_FILE=%TEMP%\abyssfetch-shortcut-%TEMP_TOKEN%.vbs"
if exist "%VBS_FILE%" goto :next_temp_file
(
  echo Set WshShell = CreateObject("WScript.Shell"^)
  echo Set Shortcut = WshShell.CreateShortcut("%SHORTCUT_PATH%"^)
  if exist "%ELECTRON_EXE%" (
    echo Shortcut.TargetPath = "%ELECTRON_EXE%"
    echo Shortcut.Arguments = """%APP_ROOT%"""
  ) else (
    echo Shortcut.TargetPath = WshShell.ExpandEnvironmentStrings("%%ComSpec%%"^)
    echo Shortcut.Arguments = "/c ""%APP_ROOT%\runme.cmd"""
  )
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
echo [ERROR] Install it once from https://nodejs.org and run "runme.cmd" again.
echo.
pause
exit /b 1

:ensure_dependencies
if exist "%ELECTRON_EXE%" exit /b 0
if exist "%ELECTRON_CMD%" exit /b 0

echo.
echo [AbyssFetch] First launch detected. Installing dependencies automatically...
echo.

pushd "%APP_ROOT%"
call npm install --no-audit --no-fund
set "INSTALL_EXIT=%errorlevel%"
popd

if %INSTALL_EXIT% neq 0 (
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
set "MISSING_FFMPEG="
set "MISSING_FFPROBE="

if not exist "%APP_ROOT%\bin\ffmpeg.exe" set "MISSING_FFMPEG=1"
if not exist "%APP_ROOT%\bin\ffprobe.exe" set "MISSING_FFPROBE=1"

if defined MISSING_FFMPEG if defined MISSING_FFPROBE (
  echo [WARN] Missing ffmpeg.exe and ffprobe.exe in bin\ - merges and conversions will not work yet.
  exit /b 0
)

if defined MISSING_FFMPEG (
  echo [WARN] Missing ffmpeg.exe in bin\ - merges and conversions will not work yet.
  exit /b 0
)

if defined MISSING_FFPROBE (
  echo [WARN] Missing ffprobe.exe in bin\ - merges and conversions will not work yet.
  exit /b 0
)

exit /b 0

:launch
set "LAUNCH_TARGET="
if exist "%ELECTRON_EXE%" set "LAUNCH_TARGET=%ELECTRON_EXE%"
if not defined LAUNCH_TARGET if exist "%ELECTRON_CMD%" set "LAUNCH_TARGET=%ELECTRON_CMD%"

if defined LAUNCH_TARGET (
  echo [AbyssFetch] Launching app...
  "%LAUNCH_TARGET%" "%APP_ROOT%"
  if errorlevel 1 (
    echo.
    echo [ERROR] Electron exited with code %errorlevel%.
    echo [ERROR] Check portable\logs\app.log for details.
    echo.
    pause
    exit /b %errorlevel%
  )
  exit /b 0
)

echo.
echo [ERROR] Could not find Electron after setup.
echo.
pause
exit /b 1
