/**
 * 测试夹具：临时数据库初始化
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { closeDb, resetDbForTests } from '../../src/db/database.js';

export async function setupTestDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-packet-test-'));
  process.env.BA_DB_PATH = path.join(tmpDir, 'test.db');
  process.env.BA_DB_KEY = crypto.randomBytes(32).toString('hex');
  delete process.env.BA_DB_PLAIN;
  delete process.env.BA_SEED_PATH;
  await resetDbForTests();
  return tmpDir;
}

export async function teardownTestDb(tmpDir) {
  closeDb();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  delete process.env.BA_DB_PATH;
  delete process.env.BA_DB_KEY;
  delete process.env.BA_DB_PLAIN;
  delete process.env.BA_SEED_PATH;
}
