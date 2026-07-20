import fs from 'fs';

import path from 'path';

import { fileURLToPath } from 'url';

import { execSync } from 'child_process';

import { encryptInstallSeed, isPlainSqliteFile, isEncryptedDbFile, decryptInstallSeed, decryptDbBuffer } from '../../server/src/db/db-crypto.js';
import { ensureDbKeyHex } from '../../server/src/db/db-key.js';



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, '../../..');

const BUNDLE = path.resolve(__dirname, '../bundle/resources');

const SERVER_SRC = path.join(ROOT, 'packages/server');

const SEED_DB = path.join(SERVER_SRC, 'data/catalog.db');

const SEED_FALLBACKS = [
  path.join(BUNDLE, 'seed', 'catalog.db'),
  path.join(SERVER_SRC, 'data/catalog-plain.db'),
];

async function resolveSeedPlainBuffer() {
  const candidates = [SEED_DB, ...SEED_FALLBACKS].filter(
    (candidate, index, list) => list.indexOf(candidate) === index
  );

  let lastError = null;

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;

    const raw = fs.readFileSync(candidate);

    if (isPlainSqliteFile(raw)) {
      console.log(`使用明文预置库: ${candidate}`);
      return raw;
    }

    if (!isEncryptedDbFile(raw)) {
      lastError = new Error(`无法识别的预置数据库格式: ${candidate}`);
      continue;
    }

    try {
      const plain = decryptInstallSeed(raw);
      console.log(`使用安装包种子库: ${candidate}`);
      return plain;
    } catch {
      // fall through
    }

    const bundleKey = process.env.BA_BUNDLE_DB_KEY?.trim();
    if (bundleKey) {
      try {
        const plain = decryptDbBuffer(raw, bundleKey);
        console.log(`使用 BA_BUNDLE_DB_KEY 解密: ${candidate}`);
        return plain;
      } catch (error) {
        lastError = error;
      }
    }

    try {
      process.env.BA_RUNTIME_DIR = path.join(SERVER_SRC, '.runtime');
      const devKey = await ensureDbKeyHex();
      const plain = decryptDbBuffer(raw, devKey);
      console.log(`使用开发密钥解密: ${candidate}`);
      return plain;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`未找到可用的预置数据库，请先准备明文 catalog.db: ${SEED_DB}`);
}

async function copySeed() {

  const seedDir = path.join(BUNDLE, 'seed');

  fs.mkdirSync(seedDir, { recursive: true });



  if (!fs.existsSync(SEED_DB)) {

    throw new Error(`未找到预置数据库: ${SEED_DB}`);

  }



  const encPath = path.join(seedDir, 'catalog.db.enc');

  const plainBuffer = await resolveSeedPlainBuffer();



  if (!isPlainSqliteFile(plainBuffer)) {

    throw new Error('预置数据库解密后不是有效的 SQLite 文件');

  }



  fs.writeFileSync(encPath, encryptInstallSeed(plainBuffer));



  const sizeKb = (fs.statSync(encPath).size / 1024).toFixed(1);

  console.log(`已生成加密预置库: seed/catalog.db.enc (${sizeKb} KB)`);

}



execSync('node scripts/verify-seed.js', {

  cwd: path.resolve(__dirname, '..'),

  stdio: 'inherit',

});

execSync('node scripts/prepare-node.js', {

  cwd: path.resolve(__dirname, '..'),

  stdio: 'inherit',

});

execSync('node scripts/build-server-exe.js', {

  cwd: path.resolve(__dirname, '..'),

  stdio: 'inherit',

});



await copySeed();



console.log(`Tauri 资源已准备: ${BUNDLE}`);

