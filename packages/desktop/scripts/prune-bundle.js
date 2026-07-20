import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(__dirname, '../bundle/resources/node_modules');

const DROP_DIRS = new Set([
  'test',
  'tests',
  '__tests__',
  'docs',
  'doc',
  'example',
  'examples',
  '.github',
  'coverage',
  'benchmark',
  'benchmarks',
  '.bin',
]);

const DROP_FILE = /\.(md|markdown|map|ts|tsx|mts|cts|flow|cjs\.map|mjs\.map)$/i;
const DROP_FILE_NAMES = new Set([
  'CHANGELOG',
  'CHANGELOG.md',
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'README',
  'README.md',
  'AUTHORS',
  'CONTRIBUTING.md',
  'tsconfig.json',
  'eslint.config.js',
  'eslint.config.mjs',
  '.eslintrc',
  '.eslintrc.json',
  '.npmignore',
  '.editorconfig',
]);

function dirSizeBytes(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
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

function pruneDir(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (DROP_DIRS.has(entry.name)) {
        fs.rmSync(full, { recursive: true, force: true });
        continue;
      }
      pruneDir(full);
      continue;
    }

    const base = entry.name;
    const extMatch = DROP_FILE.test(base);
    const nameMatch = DROP_FILE_NAMES.has(base) || DROP_FILE_NAMES.has(base.replace(/\.[^.]+$/, ''));
    if (extMatch || nameMatch) {
      fs.unlinkSync(full);
    }
  }
}

function trimSqlJs() {
  const pkgDir = path.join(TARGET, 'sql.js');
  if (!fs.existsSync(pkgDir)) return;

  const keep = new Set(['package.json', 'dist']);
  for (const entry of fs.readdirSync(pkgDir, { withFileTypes: true })) {
    if (!keep.has(entry.name)) {
      fs.rmSync(path.join(pkgDir, entry.name), { recursive: true, force: true });
    }
  }

  const distDir = path.join(pkgDir, 'dist');
  if (!fs.existsSync(distDir)) return;

  const distKeep = new Set(['sql-wasm.js', 'sql-wasm.wasm']);
  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    if (!distKeep.has(entry.name)) {
      fs.rmSync(path.join(distDir, entry.name), { recursive: true, force: true });
    }
  }
}

if (!fs.existsSync(TARGET)) {
  console.log('跳过裁剪：未找到 bundle/resources/node_modules');
  process.exit(0);
}

const before = dirSizeBytes(TARGET);
pruneDir(TARGET);
trimSqlJs();
const after = dirSizeBytes(TARGET);

console.log(
  `依赖裁剪完成: ${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB（节省 ${((before - after) / 1024 / 1024).toFixed(1)} MB）`
);
