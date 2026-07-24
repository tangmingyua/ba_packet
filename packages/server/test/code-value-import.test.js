/**
 * 模块码值：批量导入与展示映射
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import XLSX from 'xlsx';
import { closeDb, queryOne, run } from '../src/db/database.js';
import {
  importModuleCodeValues,
  listModuleCodeValues,
  listModuleCodeValueDictNames,
  saveCodeValueDisplay,
} from '../src/services/code-value.js';
import { setupTestDb } from './helpers/fixture.js';

function buildCodeValueHeader() {
  return ['码值名称', '码值代码', '码值含义', ...Array.from({ length: 11 }, (_, i) => `扩展字段${i + 1}`)];
}

function buildCodeValueExcel(rows, sheetName = '码值更新格式') {
  const wb = XLSX.utils.book_new();
  const matrix = [buildCodeValueHeader(), ...rows];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('module code values', () => {
  before(async () => {
    await setupTestDb();
    run(`INSERT OR IGNORE INTO modules (code, name, sort_order, enabled) VALUES ('RCPMIS', 'RCPMIS', 99, 1)`);
  });

  after(() => {
    closeDb();
  });

  it('imports 码值更新格式 sheet and lists by module + dict_name', () => {
    const buffer = buildCodeValueExcel([
      ['操作类型', 1, '新增'],
      ['操作类型', 2, '变更'],
      ['币种', 'CNY', '人民币', '156', 'CNY', '人民币元'],
    ]);

    const result = importModuleCodeValues(buffer, {
      moduleCode: 'RCPMIS',
      fileName: 'test.xlsx',
    });
    assert.equal(result.imported, 3);
    assert.equal(result.dictCount, 2);
    assert.ok(result.dictNames.includes('操作类型'));
    assert.ok(result.dictNames.includes('币种'));

    const listed = listModuleCodeValues('RCPMIS', '操作类型');
    assert.equal(listed.total, 2);
    assert.equal(listed.items[0].code, '1');
    assert.equal(listed.items[0].meaning, '新增');

    const currency = listModuleCodeValues('RCPMIS', '币种');
    assert.equal(currency.items[0].extend_1, '156');
    assert.equal(currency.items[0].extend_2, 'CNY');

    const dicts = listModuleCodeValueDictNames('RCPMIS');
    assert.equal(dicts.length, 2);
  });

  it('replaces module code values on re-import', () => {
    const first = buildCodeValueExcel([['操作类型', 1, '新增']]);
    importModuleCodeValues(first, { moduleCode: 'RCPMIS' });

    const second = buildCodeValueExcel([['操作类型', 9, '仅一条']]);
    importModuleCodeValues(second, { moduleCode: 'RCPMIS' });

    const listed = listModuleCodeValues('RCPMIS', '操作类型');
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0].code, '9');
  });

  it('saves extend field display mapping', () => {
    const buffer = buildCodeValueExcel([['币种', 'CNY', '人民币', '156', 'CNY', '人民币元']]);
    importModuleCodeValues(buffer, { moduleCode: 'RCPMIS' });

    saveCodeValueDisplay('RCPMIS', '币种', [
      { fieldKey: 'dict_name', displayLabel: '码表类型', sortOrder: 0, visible: true },
      { fieldKey: 'code', displayLabel: '字母代码', sortOrder: 1, visible: true },
      { fieldKey: 'meaning', displayLabel: '含义说明', sortOrder: 2, visible: true },
      { fieldKey: 'extend_1', displayLabel: '数字代码', sortOrder: 3, visible: true },
      { fieldKey: 'extend_2', displayLabel: '备用代码', sortOrder: 4, visible: true },
    ]);

    const listed = listModuleCodeValues('RCPMIS', '币种');
    assert.equal(listed.display.length, 5);
    assert.ok(listed.display.some((d) => d.fieldKey === 'code' && d.displayLabel === '字母代码'));
    assert.equal(listed.items[0].dict_name, '币种');

    const row = queryOne(
      `SELECT COUNT(*) AS c FROM module_code_dict_display WHERE module_code = 'RCPMIS' AND dict_name = '币种'`
    );
    assert.equal(Number(row.c), 5);
  });

  it('falls back to Sheet1 when 码值更新格式 is missing', () => {
    const buffer = buildCodeValueExcel([['测试表', 'A', '甲']], 'Sheet1');
    const result = importModuleCodeValues(buffer, { moduleCode: 'RCPMIS' });
    assert.equal(result.sheetName, 'Sheet1');
    assert.ok(result.dictNames.includes('测试表'));
  });
});
