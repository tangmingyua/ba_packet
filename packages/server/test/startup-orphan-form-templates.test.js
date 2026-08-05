import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { closeDb, initDb, queryOne, run, saveDb } from '../src/db/database.js';

describe('startup orphan form templates', () => {
  let tmpDir;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-orphan-test-'));
    process.env.BA_DB_PATH = path.join(tmpDir, 'test.db');
    process.env.BA_DB_KEY = crypto.randomBytes(32).toString('hex');
    delete process.env.BA_DB_PLAIN;
    await initDb({ fresh: true });
    run(
      `INSERT INTO form_templates (
         report_code, report_title, version_label, subtype_code, module_code, sheet_name,
         source_file_name, file_hash, matrix_json, merges_json, layout_json,
         col_widths_json, row_heights_json, row_count, col_count, sheet_index
       ) VALUES ('G99', 't', '1', 'missing_subtype', '1104', 's', '', 'h', '[]', '[]', '{}', '[]', '[]', 0, 0, 0)`
    );
    saveDb();
    closeDb();
  });

  after(() => {
    closeDb();
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.BA_DB_PATH;
    delete process.env.BA_DB_KEY;
  });

  it('重启 initDb 不会删除 orphan 表样', async () => {
    await initDb();
    const n = Number(queryOne('SELECT COUNT(*) AS n FROM form_templates')?.n || 0);
    assert.equal(n, 1);
    const row = queryOne('SELECT report_code, subtype_code FROM form_templates LIMIT 1');
    assert.equal(row.report_code, 'G99');
    assert.equal(row.subtype_code, 'missing_subtype');
  });
});
