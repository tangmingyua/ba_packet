# Tauri Windows 打包脚本
# 前置条件：Node.js、Rust (stable)、Visual Studio Build Tools (C++)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$repoRoot = Split-Path -Parent $root

# Rust 镜像（国内网络可选）
if (-not $env:RUSTUP_DIST_SERVER) {
  $env:RUSTUP_DIST_SERVER = 'https://rsproxy.cn'
  $env:RUSTUP_UPDATE_ROOT = 'https://rsproxy.cn/rustup'
}

$cargoConfig = Join-Path $env:USERPROFILE '.cargo\config.toml'
if (-not (Test-Path $cargoConfig)) {
  @'
[source.crates-io]
replace-with = 'rsproxy-sparse'

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"
'@ | Set-Content -Path $cargoConfig -Encoding UTF8
}

$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

Write-Host '==> 准备打包资源 (Node + server + seed)...'
Set-Location $root
node scripts/prepare-resources.js

Write-Host '==> 构建前端...'
Set-Location $repoRoot
npm run build -w @ba-packet/web

Write-Host '==> Tauri 打包 (NSIS)...'
Set-Location $root
npx tauri build

$bundleDir = Join-Path $root 'src-tauri\target\release\bundle\nsis'
if (Test-Path $bundleDir) {
  Write-Host ''
  Write-Host '打包完成，安装包目录:'
  Get-ChildItem $bundleDir -Filter *.exe | ForEach-Object { Write-Host "  $($_.FullName)" }
} else {
  Write-Host '未找到 NSIS 输出目录，请检查构建日志。'
}
