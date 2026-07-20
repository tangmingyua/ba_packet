/**
 * 将明文 catalog.db 加密为 catalog.db.enc（安装包分发用）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encryptInstallSeed, isPlainSqliteFile } from '../src/db/db-crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const plainPath = path.join(__dirname, '../data/catalog.db');
const encPath = path.join(__dirname, '../data/catalog.db.enc');

if (!fs.existsSync(plainPath)) {
  console.error('未找到明文 catalog.db');
  process.exit(1);
}

const plain = fs.readFileSync(plainPath);
if (!isPlainSqliteFile(plain)) {
  console.error('catalog.db 不是有效的 SQLite 文件');
  process.exit(1);
}

fs.writeFileSync(encPath, encryptInstallSeed(plain));
console.log(`已生成加密种子库: ${encPath} (${(fs.statSync(encPath).size / 1024).toFixed(1)} KB)`);
