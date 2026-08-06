@echo off
setlocal enabledelayedexpansion

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=amd64
if errorlevel 1 (
  echo [build-win] VS dev environment failed
  exit /b 1
)

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

cd /d "%~dp0..\..\.."
set "REPO=%CD%"
cd /d "%~dp0.."

for /f "delims=" %%i in ('node scripts\write-build-stamp.js') do set "BA_DESKTOP_BUILD_STAMP=%%i"
echo [build-win] BA_DESKTOP_BUILD_STAMP=!BA_DESKTOP_BUILD_STAMP!

echo [build-win] prepare resources...
node scripts\prepare-resources.js
if errorlevel 1 exit /b 1

echo [build-win] clean and build web-dist...
node scripts\clean-desktop-web-dist.js
cd /d "%REPO%"
call npm run build:desktop -w @ba-packet/web
if errorlevel 1 exit /b 1

echo [build-win] ensure tauri frontend...
cd /d "%REPO%\packages\desktop"
node scripts\ensure-tauri-frontend.js
if errorlevel 1 exit /b 1

echo [build-win] tauri build...
call npx tauri build --no-bundle
if errorlevel 1 exit /b 1

echo [build-win] package portable...
node scripts\package-portable.js
if errorlevel 1 exit /b 1

echo [build-win] package sfx...
node scripts\package-sfx.js
if errorlevel 1 exit /b 1

echo.
echo [build-win] done batch !BA_DESKTOP_BUILD_STAMP!
echo   portable-builds\!BA_DESKTOP_BUILD_STAMP!\
dir /b "src-tauri\target\release\portable-builds\!BA_DESKTOP_BUILD_STAMP!\口袋BA.exe" 2>nul
exit /b 0
