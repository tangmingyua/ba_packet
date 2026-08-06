import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  DESKTOP,
  FRONTEND_STAMP,
  RELEASE,
  WEB_DIST,
  portableBuildRoot,
  resolveBuildStamp,
} from './desktop-build-paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(DESKTOP, 'bundle/resources');
const PRODUCT = '口袋BA';

/** 与 tauri.conf.json bundle.resources 保持一致 */
const RESOURCE_FILES = [
  { src: 'server.exe', dest: 'server.exe' },
  { src: 'sql-wasm.wasm', dest: 'sql-wasm.wasm' },
  { src: 'dataset-schema.sql', dest: 'dataset-schema.sql' },
  { src: 'seed/catalog.db', dest: 'seed/catalog.db' },
];

const stamp = resolveBuildStamp();
const buildRoot = portableBuildRoot(stamp);
const OUT_DIR = path.join(buildRoot, PRODUCT);

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

function copyDirSync(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(from, to);
    else fs.copyFileSync(from, to);
  }
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

fs.mkdirSync(buildRoot, { recursive: true });

const mainExe = findMainExe();
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const destExe = path.join(OUT_DIR, `${PRODUCT}.exe`);
fs.copyFileSync(mainExe, destExe);
console.log(`[package-portable] 构建批次: ${stamp}`);
console.log(`[package-portable] 主程序: ${destExe}`);

for (const { src, dest } of RESOURCE_FILES) {
  const from = path.join(BUNDLE, src);
  const to = path.join(OUT_DIR, dest);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  const mb = (fs.statSync(to).size / 1024 / 1024).toFixed(1);
  console.log(`[package-portable] 资源: ${dest} (${mb} MB)`);
}

if (!fs.existsSync(WEB_DIST)) {
  throw new Error(
    `未找到桌面 web 产物，请先 npm run build:desktop -w @ba-packet/web (${WEB_DIST})`
  );
}
const webOut = path.join(OUT_DIR, 'web');
copyDirSync(WEB_DIST, webOut);
const webMb = (dirSizeBytes(webOut) / 1024 / 1024).toFixed(1);
if (Number(webMb) < 0.1) {
  throw new Error(`前端 web/ 复制失败或为空: ${webOut}`);
}
const webJs = fs.readdirSync(path.join(webOut, 'assets')).find((n) => n.startsWith('index-') && n.endsWith('.js'));
console.log(`[package-portable] 前端: web/ (${webMb} MB)${webJs ? ` · ${webJs}` : ''}`);

fs.writeFileSync(path.join(OUT_DIR, 'portable.flag'), '', 'utf-8');

const tauriConf = JSON.parse(
  fs.readFileSync(path.join(DESKTOP, 'src-tauri/tauri.conf.json'), 'utf-8')
);
const webHash = fs.existsSync(FRONTEND_STAMP)
  ? fs.readFileSync(FRONTEND_STAMP, 'utf8').trim()
  : String(fs.statSync(path.join(WEB_DIST, 'index.html')).mtimeMs);
const mainStat = fs.statSync(destExe);
const buildId = `${tauriConf.version}|${stamp}|${webHash}|${mainStat.size}`;
fs.writeFileSync(path.join(OUT_DIR, 'dist-build-id.txt'), buildId, 'utf-8');
fs.writeFileSync(path.join(OUT_DIR, 'build-stamp.txt'), `${stamp}\n`, 'utf-8');
console.log(`[package-portable] 构建标识: ${buildId}`);

const metaPath = path.join(DESKTOP, '.last-desktop-build.json');
fs.writeFileSync(
  metaPath,
  JSON.stringify({ stamp, buildRoot, outDir: OUT_DIR, webDist: WEB_DIST, buildId }, null, 2),
  'utf-8'
);

const readme = `口袋BA - 免安装版

构建批次: ${stamp}
前端来源: packages/desktop/build/web-dist（桌面专用构建目录）

1. 解压整个文件夹到任意位置（不要只复制 exe，需保留同目录下所有文件）
2. 双击「${PRODUCT}.exe」运行
3. 用户数据保存在本目录 app-data/（portable.flag 启用便携模式，catalog.db 为明文 SQLite）
4. 需要目标机器已安装 Microsoft Edge WebView2 运行时

目录内必须包含：
  - ${PRODUCT}.exe
  - web/（当前批次前端静态资源）
  - server.exe
  - sql-wasm.wasm
  - dataset-schema.sql
  - seed/catalog.db
`;
fs.writeFileSync(path.join(OUT_DIR, '使用说明.txt'), readme, 'utf-8');

const zipPath = path.join(buildRoot, `${PRODUCT}.zip`);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${OUT_DIR}\\*' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' }
);

const folderMb = (dirSizeBytes(OUT_DIR) / 1024 / 1024).toFixed(1);
const zipMb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`[package-portable] 免安装目录: ${OUT_DIR} (${folderMb} MB)`);
console.log(`[package-portable] 压缩包: ${zipPath} (${zipMb} MB)`);
