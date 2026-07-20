import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, afterEach } from 'node:test';
import { closeDb, getDbPath, initDb, queryOne } from '../src/db/database.js';

describe('database init', () => {
  let tmpDir = '';

  afterEach(() => {
    closeDb();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    delete process.env.BA_DB_PATH;
    delete process.env.BA_DB_KEY;
    delete process.env.BA_DB_PLAIN;
  });

  it('空数据库文件会自动重建', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-packet-db-empty-'));
    const dbPath = path.join(tmpDir, 'catalog.db');
    process.env.BA_DB_PATH = dbPath;
    process.env.BA_DB_KEY = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(dbPath, Buffer.alloc(0));

    await initDb({ fresh: false });

    const stat = fs.statSync(dbPath);
    assert.ok(stat.size > 0, '重建后数据库不应为空');
    const row = queryOne('SELECT COUNT(*) AS c FROM subtypes');
    assert.ok(Number(row?.c) > 0, '应包含默认子类种子数据');
    assert.equal(getDbPath(), dbPath);
  });
});
