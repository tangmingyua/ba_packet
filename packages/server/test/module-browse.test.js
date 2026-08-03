import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import XLSX from 'xlsx';
import { closeDb, run } from '../src/db/database.js';
import { createSubtypeVersion, saveFieldMappings, updateSubtype } from '../src/services/dataset-config.js';
import { importDatasetExcel } from '../src/services/dataset-import.js';
import { importConversionScript } from '../src/services/conversion-script-import.js';
import { getModuleCategoryStats, browseModuleCategory, getModuleSubtypeStats } from '../src/services/module-browse.js';
import { setupTestDb } from './helpers/fixture.js';

function buildExcel(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('module-browse', () => {
  before(async () => {
    await setupTestDb();
    run(`INSERT OR IGNORE INTO modules (code, name, sort_order, enabled) VALUES ('YBT', '一表通', 1, 1)`);
    updateSubtype('TO_EAST_FAQ', { enabled: true });
    const version = createSubtypeVersion('TO_EAST_FAQ', {
      versionLabel: 'v1',
      sheetName: '转EAST问答',
      headerRow: 1,
      dataStartRow: 2,
      isDefault: true,
    });
    saveFieldMappings(version.id, [
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
    ]);
    importDatasetExcel(
      buildExcel([{ name: '转EAST问答', rows: [['数据项名称'], ['测试项A']] }]),
      { fileName: 't.xlsx', versionIds: [version.id] }
    );
    importConversionScript(Buffer.from('SELECT 1'), {
      fileName: 'G0100.sql',
      moduleCode: 'YBT',
    });
  });

  after(() => closeDb());

  it('getModuleCategoryStats 仅返回可检索标签', () => {
    const stats = getModuleCategoryStats('YBT');
    const codes = stats.map((s) => s.code);
    assert.ok(codes.includes('composite'));
    assert.ok(codes.includes('norm'));
    assert.ok(codes.includes('logic'));
    assert.ok(codes.includes('check'));
    assert.ok(codes.includes('peer'));
    assert.ok(codes.includes('qa'));
    assert.equal(codes.length, 6);
  });

  it('browseModuleCategory 综合含脚本预览', () => {
    const result = browseModuleCategory({ moduleCode: 'YBT', category: 'composite', limit: 10 });
    assert.equal(result.layout, 'script');
    assert.ok(result.items.length >= 1);
    assert.ok('scriptPreview' in result.items[0]);
  });

  it('browseModuleCategory 答疑含 Excel 行', () => {
    const result = browseModuleCategory({ moduleCode: 'YBT', category: 'qa', limit: 10 });
    assert.equal(result.layout, 'dataset');
    assert.ok(result.total >= 1);
  });

  it('getModuleSubtypeStats 按模块与标签返回子类', () => {
    const all = getModuleSubtypeStats('YBT');
    assert.ok(all.some((s) => s.code === 'TO_EAST_FAQ'));
    assert.ok(all.some((s) => s.code === 'CONVERSION_SCRIPT'));

    const qaOnly = getModuleSubtypeStats('YBT', ['qa']);
    assert.ok(qaOnly.some((s) => s.code === 'TO_EAST_FAQ'));
    assert.ok(!qaOnly.some((s) => s.code === 'CONVERSION_SCRIPT'));
  });
});
