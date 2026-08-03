import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import {
  createSubtypeVersion,
  listSearchableCategories,
  saveFieldMappings,
  updateSubtype,
} from '../src/services/dataset-config.js';
import { importConversionScript } from '../src/services/conversion-script-import.js';
import { importModuleCodeValues } from '../src/services/code-value.js';
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

describe('searchable-categories', () => {
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

    importConversionScript(Buffer.from('SELECT 1', 'utf8'), {
      fileName: 'G0100.sql',
      moduleCode: 'YBT',
    });

    const cvBuffer = buildCodeValueExcel([codeValueHeaderRow(), ['币种', 'CNY', '人民币']]);
    importModuleCodeValues(cvBuffer, { moduleCode: 'YBT', fileName: 'cv.xlsx' });
  });

  after(async () => {
    await teardownTestDb(tmpDir);
  });

  it('仅返回库中已有资料的类型标签', () => {
    const all = listSearchableCategories();
    const codes = all.map((c) => c.code);
    assert.ok(codes.includes('composite'));
    assert.ok(codes.includes('code_value'));
    assert.ok(!codes.includes('check'));
    assert.ok(!codes.includes('logic'));
  });

  it('可按模块过滤标签', () => {
    const ybt = listSearchableCategories({ moduleCode: 'YBT' }).map((c) => c.code);
    assert.ok(ybt.includes('composite'));
    assert.ok(ybt.includes('code_value'));

    const east = listSearchableCategories({ moduleCode: 'EAST' }).map((c) => c.code);
    assert.ok(!east.includes('composite'));
    assert.ok(!east.includes('code_value'));
  });
});
