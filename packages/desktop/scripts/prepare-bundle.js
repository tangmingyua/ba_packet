import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const NODE_MODULES = path.join(ROOT, 'node_modules');
const TARGET = path.resolve(__dirname, '../bundle/resources/node_modules');
const SERVER_PKG = path.join(ROOT, 'packages/server/package.json');

const SKIP_PACKAGES = new Set([
  'ba-packet',
  '@ba-packet/server',
  '@ba-packet/web',
  '@ba-packet/desktop',
]);

/** 即使出现在依赖树里也不应打入运行时 */
const BLOCK_PACKAGES = new Set([
  '@tauri-apps/cli',
  '@tauri-apps/cli-win32-x64-msvc',
  'electron',
  'electron-builder',
  'app-builder-lib',
  'app-builder-bin',
  '7zip-bin',
  'vite',
  'rollup',
  'esbuild',
  'vue',
  '@vue/compiler-core',
  '@vue/compiler-dom',
  '@vue/compiler-sfc',
  '@vue/compiler-ssr',
  '@vue/reactivity',
  '@vue/runtime-core',
  '@vue/runtime-dom',
  '@vue/server-renderer',
  '@vue/shared',
  '@vitejs/plugin-vue',
]);

function resolvePackageNames() {
  const names = new Set();

  function addDeps(pkgJson) {
    for (const name of Object.keys(pkgJson.dependencies || {})) {
      if (SKIP_PACKAGES.has(name) || BLOCK_PACKAGES.has(name) || names.has(name)) {
        continue;
      }

      const pkgPath = path.join(NODE_MODULES, name, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        console.warn(`跳过缺失依赖: ${name}`);
        continue;
      }

      names.add(name);
      addDeps(JSON.parse(fs.readFileSync(pkgPath, 'utf8')));
    }
  }

  addDeps(JSON.parse(fs.readFileSync(SERVER_PKG, 'utf8')));
  return [...names].sort((a, b) => a.localeCompare(b));
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function copyPackage(name) {
  const src = path.join(NODE_MODULES, name);
  const dest = path.join(TARGET, name);
  if (!fs.existsSync(src)) {
    console.warn(`跳过缺失依赖: ${name}`);
    return false;
  }
  if (name.startsWith('@')) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
  }
  copyDir(src, dest);
  return true;
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += dirSizeBytes(full);
    } else {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

if (fs.existsSync(TARGET)) {
  fs.rmSync(TARGET, { recursive: true, force: true });
}

const packages = resolvePackageNames();
let copied = 0;
let skipped = 0;

for (const pkg of packages) {
  if (copyPackage(pkg)) {
    copied += 1;
  } else {
    skipped += 1;
  }
}

const sizeMb = (dirSizeBytes(TARGET) / 1024 / 1024).toFixed(1);
console.log(`运行时依赖已准备: ${TARGET}（${copied} 个包，跳过 ${skipped} 个，${sizeMb} MB）`);
