@echo off
setlocal enabledelayedexpansion

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=amd64
if errorlevel 1 (
  echo [license-issuer] VS dev environment failed
  exit /b 1
)

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cd /d "%~dp0.."

if not exist "keys\private.pem" (
  echo [license-issuer] 缺少 keys\private.pem，拒绝打包
  exit /b 1
)

echo [license-issuer] tauri build...
call npx tauri build --no-bundle
if errorlevel 1 exit /b 1

node scripts\copy-release.js
if errorlevel 1 exit /b 1
exit /b 0
