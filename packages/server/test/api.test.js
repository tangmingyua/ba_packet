/** API 路由集成测试（新模型） */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import { buildApp, getApiToken } from '../src/index.js';
import {
  createSubtypeVersion,
  saveFieldMappings,
  updateSubtype,
} from '../src/services/dataset-config.js';

let tmpDir;
let app;
let versionId;

function buildExcel(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${getApiToken()}`, ...extra };
}

describe('API 集成', () => {
  before(async () => {
    tmpDir = await setupTestDb();
    updateSubtype('TO_EAST_FAQ', { name: '转EAST问答', enabled: true, sortOrder: 4 });
    const version = createSubtypeVersion('TO_EAST_FAQ', {
      versionLabel: 'v1',
      sheetName: '转EAST问答',
      bizKeyFields: [],
    });
    versionId = version.id;
    saveFieldMappings(versionId, [
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
    ]);

    const buffer = buildExcel([
      {
        name: '转EAST问答',
        rows: [['数据项名称'], ['贷款金额'], ['贷款合同号']],
      },
    ]);
    // 先通过服务写入，供 suggest/search 使用
    const { importDatasetExcel } = await import('../src/services/dataset-import.js');
    importDatasetExcel(buffer, { fileName: 'seed.xlsx', versionIds: [versionId] });

    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
    await teardownTestDb(tmpDir);
  });

  it('GET /api/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.ok(body.records >= 1);
  });

  it('GET /api/suggest', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/suggest?q=贷款', headers: authHeaders() });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.items.length > 0);
    assert.ok(body.items[0].dataItemName);
  });

  it('GET /api/search', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=贷款', headers: authHeaders() });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.keyword, '贷款');
    assert.ok(body.reports[0].blocks.length > 0);
    assert.equal(body.reports[0].layout, 'dataset');
  });

  it('GET /api/search 空关键词', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=', headers: authHeaders() });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().error, '请输入搜索关键词');
  });

  it('GET /api/search 无令牌返回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=贷款' });
    assert.equal(res.statusCode, 401);
  });

  it('OPTIONS /api/dataset/versions/:id/mappings 允许桌面/跨域预检', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: `/api/dataset/versions/${versionId}/mappings`,
      headers: {
        origin: 'null',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    assert.equal(res.statusCode, 204);
    assert.match(res.headers['access-control-allow-origin'] || '', /null|\*/);
    assert.ok(res.headers['access-control-allow-methods']?.includes('PUT'));
  });

  it('PUT /api/dataset/versions/:id/mappings 保存字段映射', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/dataset/versions/${versionId}/mappings`,
      headers: {
        ...authHeaders({ 'content-type': 'application/json' }),
        origin: 'null',
      },
      payload: JSON.stringify({
        mappings: [
          { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false, defaultDisplay: true },
          { originalColumn: '表名', standardField: 'table_name', isRequired: false, defaultDisplay: false },
        ],
      }),
    });
    assert.equal(res.statusCode, 200);
    const saved = res.json().mappings;
    assert.equal(saved.length, 2);
    assert.equal(saved[0].defaultDisplay, true);
    assert.equal(saved[1].defaultDisplay, false);
  });

  it('GET /api/dataset/catalog', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dataset/catalog', headers: authHeaders() });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.standardFields.length >= 3);
    assert.ok(body.modules.some((m) => m.code === 'YBT'));
    assert.ok(body.subtypes.some((s) => s.code === 'TO_EAST_FAQ'));
  });

  it('GET /api/dataset/records 按版本解析为表格', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/dataset/records?versionId=${versionId}`,
      headers: authHeaders(),
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.items));
    assert.ok(Array.isArray(body.columns));
    assert.ok(body.total >= 1);
    assert.ok(body.columns.some((c) => c.header === '数据项名称' || c.field === 'data_item'));
    assert.ok(Array.isArray(body.items[0].cells));
    assert.equal(body.items[0].cells.length, body.columns.length);
  });

  it('POST /api/dataset/import 上传 Excel', async () => {
    const buffer = buildExcel([
      {
        name: '转EAST问答',
        rows: [['数据项名称'], ['客户名称']],
      },
    ]);
    const boundary = '----boundarytest';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="versionIds"\r\n\r\n[${versionId}]\r\n`
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/dataset/import',
      headers: {
        ...authHeaders(),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.summary.success, 1);
    assert.ok(body.summary.inserted >= 1);
    assert.equal(body.summary.updated, 0);
  });
});
