/** Word 原样显示导入与搜索 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import { buildApp, getApiToken } from '../src/index.js';
import {
  upsertSubtype,
  createSubtypeVersion,
} from '../src/services/dataset-config.js';
import {
  importWordFaithfulDocument,
  listWordFaithfulDocuments,
  getWordFaithfulDocument,
  blocksToSearchUnits,
  buildPreviewHtml,
  getWordFaithfulDocxBuffer,
} from '../src/services/word-faithful-import.js';
import {
  searchWordFaithfulDocuments,
  getWordFaithfulSearchHits,
} from '../src/services/word-faithful-search.js';
import { queryOne } from '../src/db/database.js';

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMinimalDocx(paragraphs) {
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t>${escapeXml(p)}</w:t></w:r></w:p>`)
    .join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr/></w:body>
</w:document>`;
  const files = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    ),
    'word/document.xml': strToU8(documentXml),
  };
  return Buffer.from(zipSync(files));
}

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${getApiToken()}`, ...extra };
}

describe('word-faithful-import', () => {
  let tmpDir;
  let app;
  const SUBTYPE = 'TEST_WORD_FAITHFUL';

  before(async () => {
    tmpDir = await setupTestDb();
    app = await buildApp();
    await app.ready();
    upsertSubtype({
      code: SUBTYPE,
      name: '测试 Word 原样',
      moduleCode: 'EAST',
      category: 'norm',
      storageKind: 'word_faithful',
      enabled: true,
      sortOrder: 900,
    });
    createSubtypeVersion(SUBTYPE, { versionLabel: 'V1', sheetName: '-' });
  });

  after(async () => {
    await app.close();
    await teardownTestDb(tmpDir);
  });

  it('blocksToSearchUnits 与 preview_html 含锚点', () => {
    const units = blocksToSearchUnits([
      { blockKind: 'paragraph', text: '即期及衍生品交易信息', sortOrder: 0 },
      { blockKind: 'heading', text: '第一章', sortOrder: 1 },
    ]);
    assert.equal(units.length, 2);
    assert.equal(units[0].sortOrder, 0);
    const html = buildPreviewHtml(units);
    assert.match(html, /data-wf-block="0"/);
    assert.match(html, /即期及衍生品交易信息/);
  });

  it('importWordFaithfulDocument 整本入库并可搜索定位', () => {
    const buffer = buildMinimalDocx(['存放同业款项说明', '即期及衍生品交易信息表填报示例']);
    const result = importWordFaithfulDocument(buffer, {
      fileName: 'east-sample.docx',
      moduleCode: 'EAST',
      subtypeCode: SUBTYPE,
      versionLabel: 'V1',
    });
    assert.equal(result.importAction, 'created');
    assert.ok(result.blockCount >= 2);

    const listed = listWordFaithfulDocuments({ subtypeCode: SUBTYPE });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].docCode, 'east-sample');

    const detail = getWordFaithfulDocument(result.id);
    assert.ok(detail.previewHtml.includes('data-wf-block="1"'));
    assert.ok(detail.previewHtml.includes('即期及衍生品'));
    assert.equal(detail.hasDocxFile, true);

    const file = getWordFaithfulDocxBuffer(result.id);
    assert.ok(file?.buffer?.length > 0);

    const search = searchWordFaithfulDocuments('即期', { subtypeCode: SUBTYPE });
    assert.equal(search.totalDocuments, 1);
    assert.ok(search.totalHits >= 1);

    const hits = getWordFaithfulSearchHits(result.id, '即期');
    assert.ok(hits.hitCount >= 1);
    assert.ok(hits.hits.some((h) => h.sortOrder != null));
  });

  it('同文件名同版本再次导入覆盖', () => {
    const buffer = buildMinimalDocx(['更新后的正文']);
    const second = importWordFaithfulDocument(buffer, {
      fileName: 'east-sample.docx',
      moduleCode: 'EAST',
      subtypeCode: SUBTYPE,
      versionLabel: 'V1',
    });
    assert.equal(second.importAction, 'replaced');
    assert.equal(listWordFaithfulDocuments({ subtypeCode: SUBTYPE }).length, 1);
    const blockCount = Number(
      queryOne('SELECT COUNT(*) AS c FROM word_faithful_blocks WHERE document_id = ?', [
        second.id,
      ])?.c || 0
    );
    assert.equal(blockCount, second.blockCount);
  });

  it('POST /api/word-faithful/import', async () => {
    createSubtypeVersion(SUBTYPE, { versionLabel: 'V2', sheetName: '-' });
    const buffer = buildMinimalDocx(['API 导入测试']);
    const form = new FormData();
    form.append('file', new Blob([buffer]), 'api-test.docx');
    form.append('moduleCode', 'EAST');
    form.append('subtypeCode', SUBTYPE);
    form.append('versionLabel', 'V2');

    const res = await app.inject({
      method: 'POST',
      url: '/api/word-faithful/import',
      headers: authHeaders(),
      payload: form,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.docCode, 'api-test');
    assert.ok(body.blockCount >= 1);
  });
});
