/** 转1104 脚本导入测试 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import { buildApp, getApiToken } from '../src/index.js';
import {
  CONVERSION_SCRIPT_LATEST_VERSION,
  deleteConversionScript,
  getConversionScript,
  importConversionScript,
  listConversionScripts,
  parseConversionScriptFileName,
} from '../src/services/conversion-script-import.js';

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${getApiToken()}`, ...extra };
}

describe('conversion-script-import', () => {
  let tmpDir;
  let app;

  before(async () => {
    tmpDir = await setupTestDb();
    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
    await teardownTestDb(tmpDir);
  });

  it('parseConversionScriptFileName 解析表号与版本', () => {
    assert.deepEqual(parseConversionScriptFileName('G0100_231.sql'), {
      reportCode: 'G0100',
      versionLabel: '231',
      sourceFileName: 'G0100_231.sql',
    });
    assert.deepEqual(parseConversionScriptFileName('S2400.txt'), {
      reportCode: 'S2400',
      versionLabel: CONVERSION_SCRIPT_LATEST_VERSION,
      sourceFileName: 'S2400.txt',
    });
    assert.throws(() => parseConversionScriptFileName('说明.sql'), /文件名须为/);
    assert.throws(() => parseConversionScriptFileName('G0100.xlsx'), /仅支持/);
  });

  it('importConversionScript 入库并可按表号查询', () => {
    const sql = 'SELECT 1 AS x;\n-- 转1104 测试';
    const first = importConversionScript(Buffer.from(sql, 'utf8'), {
      fileName: 'G0100_231.sql',
      moduleCode: 'YBT',
    });
    assert.equal(first.importAction, 'created');
    assert.equal(first.reportCode, 'G0100');
    assert.equal(first.versionLabel, '231');

    const list = listConversionScripts({ moduleCode: 'YBT', reportCode: 'G0100' });
    assert.equal(list.length, 1);
    assert.equal(list[0].sourceFileName, 'G0100_231.sql');

    const detail = getConversionScript(first.id);
    assert.equal(detail.scriptText, sql);
  });

  it('importConversionScript 无版本时用 LASTEST 且再次导入覆盖', () => {
    const first = importConversionScript(Buffer.from('SELECT 1;', 'utf8'), {
      fileName: 'G0200.sql',
      moduleCode: 'YBT',
    });
    assert.equal(first.versionLabel, CONVERSION_SCRIPT_LATEST_VERSION);

    const second = importConversionScript(Buffer.from('SELECT 2;', 'utf8'), {
      fileName: 'G0200.sql',
      moduleCode: 'YBT',
    });
    assert.equal(second.importAction, 'replaced');
    assert.equal(getConversionScript(second.id).scriptText, 'SELECT 2;');
    assert.equal(
      listConversionScripts({ moduleCode: 'YBT', reportCode: 'G0200' }).length,
      1
    );
  });

  it('importConversionScript 未选模块时报错', () => {
    assert.throws(
      () =>
        importConversionScript(Buffer.from('SELECT 1;', 'utf8'), {
          fileName: 'G0300.sql',
        }),
      /请选择模块/
    );
  });

  it('deleteConversionScript 删除记录', () => {
    const imported = importConversionScript(Buffer.from('SELECT 1;', 'utf8'), {
      fileName: 'G0400.sql',
      moduleCode: 'YBT',
    });
    const result = deleteConversionScript(imported.id);
    assert.equal(result.ok, true);
    assert.equal(getConversionScript(imported.id), null);
  });

  it('POST /api/conversion-script/import', async () => {
    const body = Buffer.from('SELECT * FROM t;', 'utf8');
    const boundary = '----cstest';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="moduleCode"\r\n\r\nYBT\r\n`
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="G0500_100.sql"\r\nContent-Type: text/plain\r\n\r\n`
      ),
      body,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/conversion-script/import',
      headers: {
        ...authHeaders(),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.equal(json.reportCode, 'G0500');
    assert.equal(json.versionLabel, '100');
  });

  it('listConversionScripts 模糊匹配表号', () => {
    importConversionScript(Buffer.from('SELECT 1;', 'utf8'), {
      fileName: 'G0300.sql',
      moduleCode: 'YBT',
    });
    importConversionScript(Buffer.from('SELECT 2;', 'utf8'), {
      fileName: 'G0310.sql',
      moduleCode: 'YBT',
    });

    const fuzzy = listConversionScripts({ moduleCode: 'YBT', reportCode: 'G031' });
    assert.equal(fuzzy.length, 1);
    assert.equal(fuzzy[0].reportCode, 'G0310');

    const all = listConversionScripts({ moduleCode: 'YBT' });
    assert.ok(all.length >= 2);
  });

  it('GET /api/conversion-scripts 与 DELETE', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/conversion-scripts?moduleCode=YBT&reportCode=G0500',
      headers: authHeaders(),
    });
    assert.equal(listRes.statusCode, 200);
    const { items } = listRes.json();
    assert.ok(items.length >= 1);

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/conversion-scripts/${items[0].id}`,
      headers: authHeaders(),
    });
    assert.equal(detailRes.statusCode, 200);
    assert.ok(detailRes.json().scriptText.includes('SELECT'));

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/conversion-scripts/${items[0].id}`,
      headers: authHeaders(),
    });
    assert.equal(delRes.statusCode, 200);
  });
});
