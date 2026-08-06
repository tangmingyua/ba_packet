import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { DESKTOP, FRONTEND_STAMP, WEB_DIST } from './desktop-build-paths.js';

const TAURI_DIR = path.join(DESKTOP, 'src-tauri');
const MAIN_EXE = path.join(TAURI_DIR, 'target/release/ba-packet-desktop.exe');

function hashDist(dir) {
  const hash = crypto.createHash('sha256');
  const files = [];

  function walk(abs, rel) {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const entryAbs = path.join(abs, entry.name);
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(entryAbs, entryRel);
      else files.push({ rel: entryRel, abs: entryAbs });
    }
  }

  if (!fs.existsSync(dir)) {
    throw new Error(`未找到桌面打包前端目录: ${dir}\n请先 npm run build:desktop -w @ba-packet/web`);
  }

  walk(dir, '');
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  for (const file of files) {
    hash.update(file.rel);
    hash.update('\0');
    hash.update(fs.readFileSync(file.abs));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const nextHash = hashDist(WEB_DIST);
const prevHash = fs.existsSync(FRONTEND_STAMP) ? fs.readFileSync(FRONTEND_STAMP, 'utf8').trim() : '';

if (nextHash !== prevHash) {
  fs.writeFileSync(FRONTEND_STAMP, `${nextHash}\n`, 'utf8');
  console.log('[ensure-tauri-frontend] 桌面 web-dist 已变化，清理 Tauri 主程序缓存以重新嵌入…');
  try {
    execSync('cargo clean -p ba-packet-desktop', { cwd: TAURI_DIR, stdio: 'inherit' });
  } catch {
    if (fs.existsSync(MAIN_EXE)) fs.unlinkSync(MAIN_EXE);
  }
} else {
  console.log('[ensure-tauri-frontend] web-dist hash 未变，沿用现有 Tauri 构建缓存');
}

const indexHtml = path.join(WEB_DIST, 'index.html');
const marker = fs.readFileSync(indexHtml, 'utf8').match(/assets\/index-[^.]+\.js/)?.[0];

if (marker && fs.existsSync(MAIN_EXE)) {
  const exe = fs.readFileSync(MAIN_EXE);
  if (!exe.includes(Buffer.from(marker, 'utf8'))) {
    console.log(`[ensure-tauri-frontend] exe 未包含 ${marker}，强制清理后重编…`);
    try {
      execSync('cargo clean -p ba-packet-desktop', { cwd: TAURI_DIR, stdio: 'inherit' });
    } catch {
      fs.unlinkSync(MAIN_EXE);
    }
  }
}
