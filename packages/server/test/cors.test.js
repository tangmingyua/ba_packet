/**
 * CORS 预检覆盖：所有带 Authorization 的跨域写操作与常见 Origin
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import { buildApp, getApiToken } from '../src/index.js';
import {
  createSubtypeVersion,
  saveFieldMappings,
  updateSubtype,
} from '../src/services/dataset-config.js';

const PREFLIGHT_HEADERS = {
  'access-control-request-method': 'PUT',
  'access-control-request-headers': 'authorization,content-type',
};

const ORIGINS = {
  desktopNull: 'null',
  localhost: 'http://localhost:5173',
  loopback: 'http://127.0.0.1:5173',
  lan: 'http://192.168.1.100:5173',
  blocked: 'https://evil.example.com',
};

/** 所有会触发跨域预检的 API（含 GET+Authorization） */
const CORS_ROUTES = [
  { method: 'OPTIONS', url: '/api/suggest?q=test', label: 'GET /api/suggest' },
  { method: 'OPTIONS', url: '/api/search?q=test', label: 'GET /api/search' },
  { method: 'OPTIONS', url: '/api/dataset/catalog', label: 'GET /api/dataset/catalog' },
  { method: 'OPTIONS', url: '/api/dataset/modules/YBT', label: 'PUT /api/dataset/modules/:code' },
  { method: 'OPTIONS', url: '/api/dataset/standard-fields', label: 'POST /api/dataset/standard-fields' },
  { method: 'OPTIONS', url: '/api/dataset/standard-fields/custom_x', label: 'DELETE /api/dataset/standard-fields/:code' },
  { method: 'OPTIONS', url: '/api/dataset/subtypes/TO_EAST_FAQ', label: 'PUT /api/dataset/subtypes/:code' },
  { method: 'OPTIONS', url: '/api/dataset/subtypes/TO_EAST_FAQ', label: 'DELETE /api/dataset/subtypes/:code' },
  { method: 'OPTIONS', url: '/api/dataset/subtypes/TO_EAST_FAQ/versions', label: 'POST .../versions' },
  { method: 'OPTIONS', url: '/api/dataset/versions/1', label: 'PUT /api/dataset/versions/:id' },
  { method: 'OPTIONS', url: '/api/dataset/versions/1', label: 'DELETE /api/dataset/versions/:id' },
  { method: 'OPTIONS', url: '/api/dataset/versions/1/clear', label: 'POST .../clear' },
  { method: 'OPTIONS', url: '/api/dataset/versions/1/mappings', label: 'PUT .../mappings' },
  { method: 'OPTIONS', url: '/api/dataset/import', label: 'POST /api/dataset/import' },
  { method: 'OPTIONS', url: '/api/dataset/records?versionId=1', label: 'GET /api/dataset/records' },
];

let tmpDir;
let app;
let versionId;

async function preflight(url, origin) {
  return app.inject({
    method: 'OPTIONS',
    url,
    headers: { origin, ...PREFLIGHT_HEADERS },
  });
}

describe('CORS 预检', () => {
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
    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
    await teardownTestDb(tmpDir);
  });

  for (const [name, origin] of Object.entries(ORIGINS)) {
    if (name === 'blocked') continue;
    it(`允许 Origin: ${origin}`, async () => {
      for (const route of CORS_ROUTES) {
        const url = route.url.replace('/versions/1', `/versions/${versionId}`).replace('versionId=1', `versionId=${versionId}`);
        const res = await preflight(url, origin);
        assert.equal(res.statusCode, 204, `${route.label} 应返回 204，实际 ${res.statusCode}`);
        assert.ok(
          res.headers['access-control-allow-origin'],
          `${route.label} 缺少 Access-Control-Allow-Origin`
        );
        assert.ok(
          res.headers['access-control-allow-methods']?.includes('PUT') ||
            res.headers['access-control-allow-methods']?.includes('GET'),
          `${route.label} 缺少 Allow-Methods`
        );
      }
    });
  }

  it('拒绝非本地 Origin', async () => {
    const res = await preflight('/api/dataset/versions/1/mappings', ORIGINS.blocked);
    assert.notEqual(res.statusCode, 204);
  });

  it('/api/health 无需鉴权且不受 CORS 策略影响', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(res.statusCode, 200);
  });

  it('跨域 PUT 写操作在 Origin null 下可成功', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/dataset/subtypes/TO_EAST_FAQ`,
      headers: {
        origin: 'null',
        authorization: `Bearer ${getApiToken()}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ name: '转EAST问答', enabled: true }),
    });
    assert.equal(res.statusCode, 200);
  });
});
