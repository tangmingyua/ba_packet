import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(__dirname, '..');
const RELEASE = path.join(DESKTOP, 'src-tauri/target/release');
const PRODUCT = '监管资料库搜索';
const PORTABLE_DIR = path.join(RELEASE, 'portable', PRODUCT);
const SFX_EXE = path.join(RELEASE, 'portable', `${PRODUCT}-免安装版.exe`);
const LAUNCHER_SRC = path.join(__dirname, 'sfx-launcher.cs');
const LAUNCHER_EXE = path.join(RELEASE, 'portable', 'sfx-launcher.exe');
const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const MAGIC = Buffer.from([0x42, 0x41, 0x53, 0x46, 0x58]); // BASFX

if (!fs.existsSync(PORTABLE_DIR)) {
  throw new Error(`未找到免安装目录: ${PORTABLE_DIR}\n请先执行 npm run dist:win:portable`);
}

// 1. 清理运行时生成的 app-data（不应进分发包）
const appData = path.join(PORTABLE_DIR, 'app-data');
if (fs.existsSync(appData)) {
  fs.rmSync(appData, { recursive: true, force: true });
  console.log('[sfx] 已清理 app-data');
}

// 2. 编译 launcher.exe（WinExe，无控制台窗口）
fs.mkdirSync(path.dirname(LAUNCHER_EXE), { recursive: true });
if (fs.existsSync(LAUNCHER_EXE)) fs.unlinkSync(LAUNCHER_EXE);
  execSync(
    `"${CSC}" /nologo /target:winexe /platform:anycpu /utf8output /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /out:"${LAUNCHER_EXE}" "${LAUNCHER_SRC}"`,
    { stdio: 'inherit' }
  );
if (!fs.existsSync(LAUNCHER_EXE)) throw new Error('launcher 编译失败');
console.log(`[sfx] launcher: ${LAUNCHER_EXE} (${(fs.statSync(LAUNCHER_EXE).size / 1024).toFixed(0)} KB)`);

// 3. 把 portable 目录打成 zip（内存）
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
  // 回退：用 PowerShell Compress-Archive
  const tmpZip = path.join(RELEASE, 'portable', '_sfx_payload.zip');
  if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${PORTABLE_DIR}\\*' -DestinationPath '${tmpZip}' -Force"`,
    { stdio: 'inherit' }
  );
  zipBuffer = fs.readFileSync(tmpZip);
  fs.unlinkSync(tmpZip);
}
console.log(`[sfx] payload zip: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

// 4. 拼接：launcher.exe + zip + zipLen(4) + magic(5)
const launcher = fs.readFileSync(LAUNCHER_EXE);
const lenBuf = Buffer.alloc(4);
lenBuf.writeInt32LE(zipBuffer.length, 0);

const out = Buffer.concat([launcher, zipBuffer, lenBuf, MAGIC]);
if (fs.existsSync(SFX_EXE)) fs.unlinkSync(SFX_EXE);
fs.writeFileSync(SFX_EXE, out);

const mb = (out.length / 1024 / 1024).toFixed(1);
console.log(`[sfx] 单文件 EXE: ${SFX_EXE} (${mb} MB)`);
console.log('[sfx] 完成。用户双击该 exe 即可，会解压/更新到 %LOCALAPPDATA%\\监管资料库搜索 并启动主程序。');
console.log('[sfx] 若界面仍是旧版：先删 %LOCALAPPDATA%\\监管资料库搜索 再运行；或重新打包后再次双击（会按 dist-build-id 自动覆盖）。');

// 清理中间产物
try { fs.unlinkSync(LAUNCHER_EXE); } catch {}
