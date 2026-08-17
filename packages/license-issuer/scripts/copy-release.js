import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'src-tauri', 'target', 'release');
const outDir = path.join(root, 'release');
const destName = '口袋BA授权工具.exe';

const candidates = [
  path.join(releaseDir, 'ba-license-issuer.exe'),
  path.join(releaseDir, destName),
];
const src = candidates.find((item) => fs.existsSync(item));
if (!src) {
  throw new Error(`未找到发卡工具 exe: ${releaseDir}`);
}

fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, destName);
fs.copyFileSync(src, dest);
const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`[license-issuer] ${dest} (${mb} MB)`);
