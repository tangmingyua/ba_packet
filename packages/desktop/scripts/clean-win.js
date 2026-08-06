import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '../..');
const WEB_DIST = path.join(ROOT, 'packages/web/dist');
const BUNDLE = path.join(DESKTOP, 'bundle/resources');
const RELEASE = path.join(DESKTOP, 'src-tauri/target/release');
const PORTABLE = path.join(RELEASE, 'portable');

function rm(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[clean-win] 已删除: ${target}`);
}

rm(WEB_DIST);
rm(BUNDLE);
rm(PORTABLE);

const mainExe = path.join(RELEASE, 'ba-packet-desktop.exe');
if (fs.existsSync(mainExe)) {
  fs.unlinkSync(mainExe);
  console.log(`[clean-win] 已删除: ${mainExe}`);
}

try {
  execSync('cargo clean', {
    cwd: path.join(DESKTOP, 'src-tauri'),
    stdio: 'inherit',
  });
} catch {
  console.warn('[clean-win] cargo clean 跳过（未安装 Rust 或失败）');
}

console.log('[clean-win] 完成。请重新执行 npm run build:desktop');
console.log(
  '[clean-win] 若曾运行过单文件 EXE，请删除旧解压目录：%LOCALAPPDATA%\\监管资料库搜索'
);
