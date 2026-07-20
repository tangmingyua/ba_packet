import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(__dirname, '..');
const RELEASE = path.join(DESKTOP, 'src-tauri/target/release');
const BUNDLE = path.join(DESKTOP, 'bundle/resources');
const PRODUCT = '监管资料库搜索';
const OUT_DIR = path.join(RELEASE, 'portable', PRODUCT);

/** 与 tauri.conf.json bundle.resources 保持一致 */
const RESOURCE_FILES = [
  { src: 'server.exe', dest: 'server.exe' },
  { src: 'sql-wasm.wasm', dest: 'sql-wasm.wasm' },
  { src: 'dataset-schema.sql', dest: 'dataset-schema.sql' },
  { src: 'seed/catalog.db.enc', dest: 'seed/catalog.db.enc' },
];

function findMainExe() {
  const candidates = [
    path.join(RELEASE, 'ba-packet-desktop.exe'),
    path.join(RELEASE, `${PRODUCT}.exe`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const matches = fs
    .readdirSync(RELEASE)
    .filter((name) => name.endsWith('.exe') && !name.includes('server'));
  if (matches.length === 1) {
    return path.join(RELEASE, matches[0]);
  }
  throw new Error(`未找到主程序 exe，请先执行 tauri build --no-bundle (${RELEASE})`);
}

function dirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSizeBytes(full) : fs.statSync(full).size;
  }
  return total;
}

function ensureBundleResources() {
  const missing = [];
  for (const { src } of RESOURCE_FILES) {
    const full = path.join(BUNDLE, src);
    if (!fs.existsSync(full)) missing.push(full);
  }
  if (missing.length) {
    throw new Error(
      `缺少打包资源，请先执行 npm run predist:win:\n${missing.map((item) => `  - ${item}`).join('\n')}`
    );
  }
}

ensureBundleResources();

const mainExe = findMainExe();
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const destExe = path.join(OUT_DIR, `${PRODUCT}.exe`);
fs.copyFileSync(mainExe, destExe);
console.log(`[package-portable] 主程序: ${destExe}`);

for (const { src, dest } of RESOURCE_FILES) {
  const from = path.join(BUNDLE, src);
  const to = path.join(OUT_DIR, dest);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  const mb = (fs.statSync(to).size / 1024 / 1024).toFixed(1);
  console.log(`[package-portable] 资源: ${dest} (${mb} MB)`);
}

fs.writeFileSync(path.join(OUT_DIR, 'portable.flag'), '', 'utf-8');

const readme = `监管资料库搜索 - 免安装版

1. 解压整个文件夹到任意位置（不要只复制 exe，需保留同目录下所有文件）
2. 双击「${PRODUCT}.exe」运行
3. 用户数据保存在本目录 app-data/（portable.flag 启用便携模式）
4. 需要目标机器已安装 Microsoft Edge WebView2 运行时

目录内必须包含：
  - ${PRODUCT}.exe
  - server.exe
  - sql-wasm.wasm
  - dataset-schema.sql
  - seed/catalog.db.enc
`;
fs.writeFileSync(path.join(OUT_DIR, '使用说明.txt'), readme, 'utf-8');

const zipPath = path.join(RELEASE, 'portable', `${PRODUCT}-免安装版.zip`);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${OUT_DIR}\\*' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' }
);

const folderMb = (dirSizeBytes(OUT_DIR) / 1024 / 1024).toFixed(1);
const zipMb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`[package-portable] 免安装目录: ${OUT_DIR} (${folderMb} MB)`);
console.log(`[package-portable] 压缩包: ${zipPath} (${zipMb} MB)`);
