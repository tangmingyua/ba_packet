import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import {
  createSubtypeVersion,
  saveFieldMappings,
  updateSubtype,
} from '../src/services/dataset-config.js';
import { importConversionScript } from '../src/services/conversion-script-import.js';
import { importModuleCodeValues } from '../src/services/code-value.js';
import { unifiedSearch, searchModuleHitMap, searchTabHitStats } from '../src/services/unified-search.js';
import { upsertSubtype } from '../src/services/dataset-config.js';
import { run } from '../src/db/database.js';
import XLSX from 'xlsx';

function codeValueHeaderRow() {
  return ['码值名称', '码值代码', '码值含义', ...Array.from({ length: 11 }, (_, i) => `扩展字段${i + 1}`)];
}

function buildCodeValueExcel(rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, '码值');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('unified-search', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await setupTestDb();
    updateSubtype('TO_EAST_FAQ', { enabled: true });
    const version = createSubtypeVersion('TO_EAST_FAQ', {
      versionLabel: 'v1',
      sheetName: '转EAST问答',
    });
    saveFieldMappings(version.id, [
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
    ]);

    importConversionScript(Buffer.from('SELECT 1 -- G0100 test', 'utf8'), {
      fileName: 'G0100.sql',
      moduleCode: 'YBT',
    });

    const cvBuffer = buildCodeValueExcel([
      codeValueHeaderRow(),
      ['币种', 'CNY', '人民币'],
    ]);
    importModuleCodeValues(cvBuffer, { moduleCode: 'YBT', fileName: 'cv.xlsx' });

    const imasBuffer = buildCodeValueExcel([
      codeValueHeaderRow(),
      ['IMAS专用码表', 'IMAS-ONLY', '仅利率报备'],
    ]);
    importModuleCodeValues(imasBuffer, { moduleCode: 'IMAS', fileName: 'imas-cv.xlsx' });
  });

  after(async () => {
    await teardownTestDb(tmpDir);
  });

  it('aggregate 模式联邦检索脚本与码值', () => {
    const scriptResult = unifiedSearch('G0100', { mode: 'aggregate', categories: ['to1104'] });
    assert.ok(scriptResult.reports.some((r) => r.layout === 'script'));

    const emptyScript = unifiedSearch('', {
      mode: 'aggregate',
      categories: ['to1104'],
      moduleCode: 'YBT',
    });
    assert.ok(emptyScript.reports.some((r) => r.layout === 'script' && r.hitCount >= 1));
    assert.ok(emptyScript.reports.every((r) => r.layout === 'script'));

    const codeResult = unifiedSearch('人民币', { mode: 'aggregate', categories: ['code_value'] });
    assert.ok(codeResult.reports.some((r) => r.layout === 'code_value'));

    const modResult = unifiedSearch('G0100', {
      mode: 'aggregate',
      categories: ['to1104'],
      moduleCode: 'YBT',
    });
    assert.ok(modResult.reports.every((r) => r.moduleCode === 'YBT'));
  });

  it('qa 模式仅检索 Excel 答疑', () => {
    const result = unifiedSearch('不存在的关键词xyz', { mode: 'qa' });
    assert.equal(result.reports.length, 0);
  });

  it('qa 模式含 Word 原样显示子类检索', () => {
    upsertSubtype({
      code: 'YBT_WF_QA_SEARCH',
      name: 'Word 答疑检索',
      moduleCode: 'YBT',
      category: 'qa',
      storageKind: 'word_faithful',
      enabled: true,
      sortOrder: 995,
    });
    run(
      `INSERT INTO word_faithful_documents (
         doc_code, doc_title, version_label, subtype_code, module_code, source_file_name, file_hash, block_count, preview_html
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'wf-search',
        '征信答疑示例',
        'V2026',
        'YBT_WF_QA_SEARCH',
        'YBT',
        'qa.docx',
        'hash-wf-search',
        2,
        '<div></div>',
      ]
    );
    run(
      `INSERT INTO word_faithful_blocks (document_id, sort_order, block_kind, text)
       VALUES ((SELECT id FROM word_faithful_documents WHERE doc_code = 'wf-search'), 0, 'paragraph', ?)`,
      ['即期及衍生品交易信息']
    );

    const empty = unifiedSearch('', {
      mode: 'qa',
      moduleCode: 'YBT',
      subtypeCode: 'YBT_WF_QA_SEARCH',
    });
    assert.equal(empty.reports.length, 1);
    assert.equal(empty.reports[0].layout, 'word_faithful');
    assert.equal(empty.reports[0].hitCount, 1);

    const hit = unifiedSearch('即期', {
      mode: 'qa',
      moduleCode: 'YBT',
      subtypeCode: 'YBT_WF_QA_SEARCH',
    });
    assert.equal(hit.reports.length, 1);
    assert.ok(hit.reports[0].hitCount >= 1);
  });

  it('searchModuleHitMap 跨模块探测 Word 答疑命中', () => {
    upsertSubtype({
      code: 'YBT_WF_QA_HITMAP',
      name: 'Word 答疑命中图',
      moduleCode: 'YBT',
      category: 'qa',
      storageKind: 'word_faithful',
      enabled: true,
      sortOrder: 996,
    });
    run(
      `INSERT INTO word_faithful_documents (
         doc_code, doc_title, version_label, subtype_code, module_code, source_file_name, file_hash, block_count, preview_html
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'wf-hitmap',
        '命中图示例',
        'V2026',
        'YBT_WF_QA_HITMAP',
        'YBT',
        'qa.docx',
        'hash-wf-hitmap',
        1,
        '<div></div>',
      ]
    );
    run(
      `INSERT INTO word_faithful_blocks (document_id, sort_order, block_kind, text)
       VALUES ((SELECT id FROM word_faithful_documents WHERE doc_code = 'wf-hitmap'), 0, 'paragraph', ?)`,
      ['跨模块红点关键词']
    );

    const empty = searchModuleHitMap('', { mode: 'qa' });
    assert.equal(empty.items.length, 0);

    const map = searchModuleHitMap('跨模块红点', { mode: 'qa' });
    assert.ok(map.items.length >= 2);
    const ybt = map.items.find((i) => i.moduleCode === 'YBT');
    const imas = map.items.find((i) => i.moduleCode === 'IMAS');
    assert.ok(ybt?.hasHits);
    assert.equal(imas?.hasHits, false);
  });

  it('searchTabHitStats 返回标签与子类命中数', () => {
    upsertSubtype({
      code: 'YBT_WF_QA_TABSTATS',
      name: 'Word 答疑 Tab 统计',
      moduleCode: 'YBT',
      category: 'qa',
      storageKind: 'word_faithful',
      enabled: true,
      sortOrder: 997,
    });
    run(
      `INSERT INTO word_faithful_documents (
         doc_code, doc_title, version_label, subtype_code, module_code, source_file_name, file_hash, block_count, preview_html
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'wf-tabstats',
        'Tab 统计示例',
        'V2026',
        'YBT_WF_QA_TABSTATS',
        'YBT',
        'qa.docx',
        'hash-wf-tabstats',
        1,
        '<div></div>',
      ]
    );
    run(
      `INSERT INTO word_faithful_blocks (document_id, sort_order, block_kind, text)
       VALUES ((SELECT id FROM word_faithful_documents WHERE doc_code = 'wf-tabstats'), 0, 'paragraph', ?)`,
      ['Tab统计专用关键词']
    );

    const stats = searchTabHitStats('Tab统计专用', { mode: 'qa', moduleCode: 'YBT' });
    const qaCat = stats.categories.find((c) => c.code === 'qa');
    assert.ok(qaCat?.hitCount >= 1);
    const wfSubtype = stats.subtypes.find((s) => s.code === 'YBT_WF_QA_TABSTATS');
    assert.ok(wfSubtype?.hitCount >= 1);
  });

  it('码值子类检索不受 OR/AND 优先级影响，空关键词仅返回指定模块', () => {
    const imasResult = unifiedSearch('', {
      mode: 'aggregate',
      moduleCode: 'IMAS',
      subtypeCode: 'IMAS_CODE_VALUE',
    });
    assert.equal(imasResult.reports.length, 1);
    assert.equal(imasResult.reports[0].moduleCode, 'IMAS');
    assert.equal(imasResult.reports[0].hitCount, 1);
    assert.ok(
      imasResult.reports[0].blocks.some((b) =>
        b.items.some((item) => item.payload?.code === 'IMAS-ONLY')
      )
    );

    const ybtResult = unifiedSearch('', {
      mode: 'aggregate',
      moduleCode: 'YBT',
      subtypeCode: 'YBT_CODE_VALUE',
    });
    assert.equal(ybtResult.reports.length, 1);
    assert.equal(ybtResult.reports[0].moduleCode, 'YBT');
    assert.ok(ybtResult.reports.every((r) => r.moduleCode === 'YBT'));
  });
});
