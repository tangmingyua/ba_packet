/** 1104 合并填报说明 Word 导入测试 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import { buildApp, getApiToken } from '../src/index.js';
import {
  deleteDocument,
  getDocument,
  getDocumentByReport,
  importFillInstructionDocument,
  updateDocumentReportMapping,
  getDocumentIndicator,
  listDocuments,
} from '../src/services/document-import.js';
import { queryAll } from '../src/db/database.js';
import { stripRomanIndicatorPrefix } from '../src/services/docx-fill-instruction-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DOCX = path.resolve(__dirname, '../../../参考/文档/1104合并填报说明202601.docx');

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${getApiToken()}`, ...extra };
}

describe('document-import step1', () => {
  let tmpDir;
  let app;
  let sampleBuffer;

  before(async () => {
    tmpDir = await setupTestDb();
    app = await buildApp();
    await app.ready();
    sampleBuffer = fs.readFileSync(SAMPLE_DOCX);
  });

  after(async () => {
    await app.close();
    await teardownTestDb(tmpDir);
  });

  it('importFillInstructionDocument 拆分为多条 document 并写入节点树', () => {
    const result = importFillInstructionDocument(sampleBuffer, {
      fileName: '1104合并填报说明202601.docx',
    });

    assert.equal(result.ok, true);
    assert.ok(result.documentCount >= 10);
    assert.ok(result.items.some((item) => item.docCode === 'G01'));
    assert.ok(result.items.some((item) => item.reportCode === 'G0100'));

    const g01Item = result.items.find((item) => item.docCode === 'G01');
    assert.ok(g01Item.nodeCount > 100);

    const listed = listDocuments();
    const uniqueCodes = new Set(result.items.map((item) => item.docCode));
    assert.equal(listed.length, uniqueCodes.size, '同 doc_code 在单次导入中后者覆盖前者');
    assert.ok(listed.some((d) => d.docCode === 'GF01_Ⅱ'));
    const g01Listed = listed.find((d) => d.docCode === 'G01');
    assert.equal(g01Listed.reportCode, 'G0100');
    assert.ok(g01Listed.nodeCount > 0);

    const full = getDocument(g01Listed.id);
    assert.equal(full.docCode, 'G01');
    assert.ok(full.tree);
    assert.equal(full.nodeKind, undefined);
    assert.ok(full.tree.children?.length > 0);
  });

  it('同 doc_code 再次导入覆盖节点', () => {
    const first = importFillInstructionDocument(sampleBuffer, { fileName: 'a.docx' });
    const g01First = first.items.find((item) => item.docCode === 'G01');
    assert.ok(g01First);
    const firstListedCount = listDocuments().length;

    const second = importFillInstructionDocument(sampleBuffer, { fileName: 'b.docx' });
    const g01Second = second.items.find((item) => item.docCode === 'G01');
    assert.equal(g01Second.overwritten, true);
    assert.equal(g01Second.id, g01First.id);
    assert.equal(listDocuments().length, firstListedCount);
  });

  it('getDocumentByReport G0100 返回元数据', () => {
    importFillInstructionDocument(sampleBuffer, { fileName: 'map.docx' });
    const meta = getDocumentByReport('G0100');
    assert.ok(meta);
    assert.equal(meta.docCode, 'G01');
    assert.equal(meta.reportCode, 'G0100');
    assert.ok(meta.nodeCount > 0);
    assert.equal(getDocumentByReport('G9999'), null);
  });

  it('getDocumentByReport 无映射时返回 null', () => {
    importFillInstructionDocument(sampleBuffer, { fileName: 'sub.docx' });
    assert.equal(getDocumentByReport('G0101A'), null);
    assert.equal(getDocumentByReport('G0101B'), null);
  });

  it('deleteDocument 删除记录与映射', () => {
    importFillInstructionDocument(sampleBuffer, { fileName: 'del.docx' });
    const g01 = listDocuments().find((d) => d.docCode === 'G01');
    assert.ok(g01);

    const deleted = deleteDocument(g01.id);
    assert.equal(deleted.docCode, 'G01');
    assert.equal(listDocuments().find((d) => d.id === g01.id), undefined);
    assert.equal(getDocumentByReport('G0100'), null);
  });

  it('POST /api/document/import 与 GET /api/documents', async () => {
    const boundary = '----ba-test-boundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="1104.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`
      ),
      sampleBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const importRes = await app.inject({
      method: 'POST',
      url: '/api/document/import',
      headers: {
        ...authHeaders(),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    assert.equal(importRes.statusCode, 200);
    const imported = importRes.json();
    assert.ok(imported.documentCount >= 10);

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/documents',
      headers: authHeaders(),
    });
    assert.equal(listRes.statusCode, 200);
    const { items } = listRes.json();
    assert.ok(items.some((d) => d.docCode === 'G01' && d.nodeCount > 0));

    const byReportRes = await app.inject({
      method: 'GET',
      url: '/api/documents/by-report/G0100',
      headers: authHeaders(),
    });
    assert.equal(byReportRes.statusCode, 200);
    assert.equal(byReportRes.json().docCode, 'G01');
  });

  it('updateDocumentReportMapping 可人工设置或清除表样关联', () => {
    importFillInstructionDocument(sampleBuffer, { fileName: 'map.docx' });
    const gf01 = listDocuments().find((d) => d.docCode === 'GF01');
    assert.ok(gf01);
    assert.equal(gf01.reportCode, null);

    const updated = updateDocumentReportMapping(gf01.id, 'G9999');
    assert.equal(updated.reportCode, 'G9999');
    assert.equal(getDocument(gf01.id).reportCode, 'G9999');

    updateDocumentReportMapping(gf01.id, '');
    assert.equal(getDocument(gf01.id).reportCode, null);
  });

  it('getDocumentIndicator 按指标序号返回说明段落', () => {
    importFillInstructionDocument(sampleBuffer, { fileName: 'ind.docx' });
    const g01 = listDocuments().find((d) => d.docCode === 'G01');
    assert.ok(g01);

    const hit = getDocumentIndicator(g01.id, '4');
    assert.equal(hit.found, true);
    assert.equal(hit.indicatorKey, '4');
    assert.match(hit.indicator.text, /存放同业|现金|贵金属|中央银行|同业/);
    assert.ok(hit.indicator.children.some((c) => c.nodeKind === 'body'));

    const miss = getDocumentIndicator(g01.id, '99999');
    assert.equal(miss.found, false);
    assert.equal(miss.indicator, null);

    // 罗马前缀：库中存 Ⅲ_4，用短 key「4」应能命中
    const g26 = listDocuments().find((d) => d.docCode === 'G26');
    assert.ok(g26);
    const exact = getDocumentIndicator(g26.id, 'Ⅲ_4');
    assert.equal(exact.found, true);
    assert.equal(exact.indicatorKey, 'Ⅲ_4');

    const byShort = getDocumentIndicator(g26.id, '4');
    assert.equal(byShort.found, true);
    assert.equal(byShort.indicatorKey, 'Ⅲ_4');
    assert.equal(byShort.queryKey, '4');
    assert.equal(stripRomanIndicatorPrefix(byShort.indicatorKey), '4');

    const romanRows = queryAll(
      `SELECT indicator_key FROM document_nodes
       WHERE document_id = ? AND node_kind = 'indicator' AND indicator_key LIKE '%\_%' ESCAPE '\\'`,
      [g26.id]
    );
    assert.ok(romanRows.some((r) => r.indicator_key === 'Ⅲ_4'));
  });
});
