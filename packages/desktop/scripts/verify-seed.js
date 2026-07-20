import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isEncryptedDbFile, isPlainSqliteFile } from '../../server/src/db/db-crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../server/data/catalog.db');

if (!fs.existsSync(dbPath)) {
  console.error('未找到预置数据库 catalog.db');
  process.exit(1);
}

const size = fs.statSync(dbPath).size;
if (size < 1024) {
  console.error('catalog.db 文件过小，可能未正确导入数据');
  process.exit(1);
}

const header = fs.readFileSync(dbPath, { start: 0, end: 15 });
if (isPlainSqliteFile(header)) {
  console.log(`预置数据库就绪（明文 SQLite）: ${dbPath} (${(size / 1024).toFixed(1)} KB)`);
} else if (isEncryptedDbFile(header)) {
  console.warn(
    `[verify-seed] 警告: catalog.db 已是用户密钥加密格式（非明文）。\n` +
      `  打包时会尝试 BA_BUNDLE_DB_KEY / .runtime 密钥解密，或回退 bundle/resources/seed/catalog.db。\n` +
      `  推荐：保留一份明文库（catalog-plain.db）或导出明文后再打包。`
  );
  console.log(`预置数据库存在（加密）: ${dbPath} (${(size / 1024).toFixed(1)} KB)`);
} else {
  console.error('catalog.db 格式无法识别');
  process.exit(1);
}
