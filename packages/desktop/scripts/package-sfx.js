import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { DESKTOP, RELEASE } from './desktop-build-paths.js';
import { readDesktopProductFolderName } from './desktop-product-name.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCT = readDesktopProductFolderName();
const LAUNCHER_SRC = path.join(__dirname, 'sfx-launcher.cs');
const LAUNCHER_INSTALL_DIR = path.join(__dirname, 'sfx-install-dir.g.cs');
const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const MAGIC = Buffer.from([0x42, 0x41, 0x53, 0x46, 0x58]); // BASFX

function writeLauncherInstallDir(installDir) {
  const escaped = installDir.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  fs.writeFileSync(
    LAUNCHER_INSTALL_DIR,
    `// 由 package-sfx.js 生成\ninternal static class SfxInstallDir\n{\n    public const string Value = "${escaped}";\n}\n`,
    'utf-8'
  );
}

const metaPath = path.join(DESKTOP, '.last-desktop-build.json');
if (!fs.existsSync(metaPath)) {
  throw new Error(`未找到 ${metaPath}，请先执行 node scripts/package-portable.js`);
}
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
const buildRoot = meta.buildRoot;
const PORTABLE_DIR = meta.outDir;
const stamp = meta.stamp;

if (!fs.existsSync(PORTABLE_DIR)) {
  throw new Error(`未找到免安装目录: ${PORTABLE_DIR}\n请先执行 node scripts/package-portable.js`);
}

const SFX_EXE = path.join(buildRoot, `${PRODUCT}.exe`);
const LAUNCHER_EXE = path.join(buildRoot, 'sfx-launcher.exe');

const appData = path.join(PORTABLE_DIR, 'app-data');
if (fs.existsSync(appData)) {
  fs.rmSync(appData, { recursive: true, force: true });
  console.log('[sfx] 已清理 app-data');
}

if (fs.existsSync(LAUNCHER_EXE)) fs.unlinkSync(LAUNCHER_EXE);
writeLauncherInstallDir(PRODUCT);
execSync(
  `"${CSC}" /nologo /target:winexe /platform:anycpu /utf8output /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /out:"${LAUNCHER_EXE}" "${LAUNCHER_SRC}" "${LAUNCHER_INSTALL_DIR}"`,
  { stdio: 'inherit' }
);
if (!fs.existsSync(LAUNCHER_EXE)) throw new Error('launcher 编译失败');
console.log(`[sfx] launcher: ${LAUNCHER_EXE} (${(fs.statSync(LAUNCHER_EXE).size / 1024).toFixed(0)} KB)`);

const AdmZip = await import('adm-zip').catch(() => null);
let zipBuffer;
if (AdmZip && AdmZip.default) {
  const zip = new AdmZip.default();
  function addDir(absDir, relDir) {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const abs = path.join(absDir, entry.name);
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) addDir(abs, rel);
      else zip.addLocalFile(abs, path.dirname(rel) || '');
    }
  }
  addDir(PORTABLE_DIR, '');
  zipBuffer = zip.toBuffer();
} else {
  const tmpZip = path.join(buildRoot, '_sfx_payload.zip');
  if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${PORTABLE_DIR}\\*' -DestinationPath '${tmpZip}' -Force"`,
    { stdio: 'inherit' }
  );
  zipBuffer = fs.readFileSync(tmpZip);
  fs.unlinkSync(tmpZip);
}
console.log(`[sfx] payload zip: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

const launcher = fs.readFileSync(LAUNCHER_EXE);
const lenBuf = Buffer.alloc(4);
lenBuf.writeInt32LE(zipBuffer.length, 0);
const out = Buffer.concat([launcher, zipBuffer, lenBuf, MAGIC]);
if (fs.existsSync(SFX_EXE)) fs.unlinkSync(SFX_EXE);
fs.writeFileSync(SFX_EXE, out);

const mb = (out.length / 1024 / 1024).toFixed(1);
console.log(`[sfx] 单文件 EXE (${stamp}): ${SFX_EXE} (${mb} MB)`);
console.log(
  `[sfx] 完成。解压目录: %LOCALAPPDATA%\\${PRODUCT}（app-data 随版本独立，首启从 seed 初始化）`
);

if (fs.existsSync(LAUNCHER_EXE)) fs.unlinkSync(LAUNCHER_EXE);
