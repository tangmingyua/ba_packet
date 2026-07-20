import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const SERVER_ENTRY = path.join(ROOT, 'packages/server/src/index.js');
const RESOURCES = path.resolve(__dirname, '../bundle/resources');
const BUILD_DIR = path.join(RESOURCES, 'pkg-build');
const BUNDLE_FILE = path.join(BUILD_DIR, 'server.cjs');
const SERVER_EXE = path.join(RESOURCES, 'server.exe');
const NODE_BASE = path.join(RESOURCES, 'node.exe');
const WASM_SRC = path.join(ROOT, 'node_modules/sql.js/dist/sql-wasm.wasm');
const SCHEMA_SRC = path.join(ROOT, 'packages/server/src/db/dataset-schema.sql');
const SEA_BLOB = path.join(BUILD_DIR, 'sea-prep.blob');
const SEA_CONFIG = path.join(BUILD_DIR, 'sea-config.json');
const KNOWN_SEA_FUSES = [
  'NODE_SEA_FUSE_fce680ab2cc467b686e561b3363c0a78',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];

function detectSeaFuse(nodeExePath) {
  const binary = fs.readFileSync(nodeExePath);
  const text = binary.toString('latin1');
  for (const fuse of KNOWN_SEA_FUSES) {
    if (text.includes(fuse)) return fuse;
  }
  const match = text.match(/NODE_SEA_FUSE_[0-9a-f]{32}/);
  if (match) return match[0];
  throw new Error(`无法在 ${nodeExePath} 中找到 SEA fuse，请升级 Node 或 postject`);
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

function removeIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

if (!fs.existsSync(NODE_BASE)) {
  throw new Error(`缺少 ${NODE_BASE}，请先执行 prepare-node.js`);
}
if (!fs.existsSync(WASM_SRC)) {
  throw new Error(`未找到 sql.js wasm: ${WASM_SRC}`);
}
if (!fs.existsSync(SCHEMA_SRC)) {
  throw new Error(`未找到 schema 文件: ${SCHEMA_SRC}`);
}

removeIfExists(BUILD_DIR);
fs.mkdirSync(BUILD_DIR, { recursive: true });

console.log('[build-server-exe] esbuild 打包服务端...');
await esbuild.build({
  entryPoints: [SERVER_ENTRY],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: BUNDLE_FILE,
  logLevel: 'info',
  sourcemap: false,
  minify: false,
  external: ['@primno/dpapi'],
  banner: {
    js: "var __importMetaUrl = require('url').pathToFileURL(__filename).href;",
  },
  define: {
    'import.meta.url': '__importMetaUrl',
  },
});

fs.writeFileSync(
  SEA_CONFIG,
  JSON.stringify(
    {
      main: './server.cjs',
      output: './sea-prep.blob',
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    },
    null,
    2
  )
);

console.log('[build-server-exe] Node SEA 生成 server.exe ...');
execSync(`"${NODE_BASE}" --experimental-sea-config sea-config.json`, {
  cwd: BUILD_DIR,
  stdio: 'inherit',
});

if (!fs.existsSync(path.join(BUILD_DIR, 'sea-prep.blob'))) {
  throw new Error('SEA blob 生成失败');
}

removeIfExists(SERVER_EXE);
fs.copyFileSync(NODE_BASE, SERVER_EXE);

const seaFuse = detectSeaFuse(NODE_BASE);
console.log(`[build-server-exe] 使用 SEA fuse: ${seaFuse}`);

execSync(
  `npx postject "${SERVER_EXE}" NODE_SEA_BLOB "${SEA_BLOB}" --sentinel-fuse ${seaFuse}`,
  { stdio: 'inherit' }
);

fs.copyFileSync(WASM_SRC, path.join(RESOURCES, 'sql-wasm.wasm'));
fs.copyFileSync(SCHEMA_SRC, path.join(RESOURCES, 'dataset-schema.sql'));

removeIfExists(path.join(RESOURCES, 'node_modules'));
removeIfExists(path.join(RESOURCES, 'server'));

const exeMb = (fs.statSync(SERVER_EXE).size / 1024 / 1024).toFixed(1);
console.log(
  `[build-server-exe] 完成: server.exe (${exeMb} MB)，资源目录合计 ${(dirSizeBytes(RESOURCES) / 1024 / 1024).toFixed(1)} MB`
);
