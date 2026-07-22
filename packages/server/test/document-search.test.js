/** 1104 填报说明搜索测试 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import { buildApp, getApiToken } from '../src/index.js';
import { importFillInstructionDocument, listDocuments } from '../src/services/document-import.js';
import { searchDocuments, getDocumentSearchHits } from '../src/services/document-search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DOCX = path.resolve(__dirname, '../../../参考/文档/1104合并填报说明202601.docx');

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${getApiToken()}`, ...extra };
}

describe('document-search', () => {
  let tmpDir;
  let app;
  let g01Id;

  before(async () => {
    tmpDir = await setupTestDb();
    importFillInstructionDocument(fs.readFileSync(SAMPLE_DOCX), {
      fileName: '1104合并填报说明202601.docx',
    });
    g01Id = listDocuments().find((d) => d.docCode === 'G01')?.id;
    assert.ok(g01Id);
    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
    await teardownTestDb(tmpDir);
  });

  it('searchDocuments 空关键词返回空结果', () => {
    const result = searchDocuments('');
    assert.equal(result.totalDocuments, 0);
    assert.deepEqual(result.items, []);
  });

  it('searchDocuments 按文档聚合命中', () => {
    const result = searchDocuments('存放同业');
    assert.ok(result.totalDocuments >= 1);
    assert.ok(result.items.some((x) => x.docCode === 'G01'));
    const g01 = result.items.find((x) => x.docCode === 'G01');
    assert.ok(g01.hitCount >= 1);
  });

  it('searchDocuments 可命中文档代号', () => {
    const result = searchDocuments('G01');
    assert.ok(result.items.some((x) => x.docCode === 'G01'));
  });

  it('getDocumentSearchHits 返回节点明细', () => {
    const result = getDocumentSearchHits(g01Id, '存放同业');
    assert.ok(result.hitCount >= 1);
    assert.ok(result.hits.length >= 1);
    assert.ok(result.hits.some((h) => h.nodeId != null || h.nodeKind === 'document_code'));
    assert.ok(result.hits.every((h) => h.snippet));
  });

  it('GET /api/documents/search', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/documents/search?q=' + encodeURIComponent('现金'),
      headers: authHeaders(),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.ok(json.totalDocuments >= 1);
  });

  it('GET /api/documents/:id/search-hits', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/documents/${g01Id}/search-hits?q=` + encodeURIComponent('存放同业'),
      headers: authHeaders(),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.ok(json.hitCount >= 1);
    assert.ok(Array.isArray(json.hits));
  });

  it('GET /api/documents/search 缺 q 返回 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/documents/search',
      headers: authHeaders(),
    });
    assert.equal(res.statusCode, 400);
  });
});
