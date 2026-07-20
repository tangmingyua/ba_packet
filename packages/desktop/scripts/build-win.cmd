@echo off
setlocal enabledelayedexpansion

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=amd64
if errorlevel 1 (
  echo [build-win] VS 开发环境初始化失败
  exit /b 1
)

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

cd /d "%~dp0..\..\.."
set REPO=%CD%
cd /d "%~dp0.."

echo [build-win] 准备打包资源...
node scripts\prepare-resources.js
if errorlevel 1 exit /b 1

echo [build-win] 构建前端...
cd /d "%REPO%"
call npm run build -w @ba-packet/web
if errorlevel 1 exit /b 1

echo [build-win] Tauri 打包（免安装版）...
cd /d "%REPO%\packages\desktop"
call npx tauri build --no-bundle
if errorlevel 1 exit /b 1

echo [build-win] 生成免安装目录与 zip...
cd /d "%REPO%\packages\desktop"
node scripts\package-portable.js
if errorlevel 1 exit /b 1

echo.
echo [build-win] 打包完成:
dir /b "src-tauri\target\release\portable\*.zip" 2>nul
dir /b "src-tauri\target\release\portable\监管资料库搜索\*.exe" 2>nul
exit /b 0
