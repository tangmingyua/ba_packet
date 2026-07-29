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
import { unifiedSearch } from '../src/services/unified-search.js';
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
