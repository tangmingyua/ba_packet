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

const CORE_HEADERS_FOR_TEST = ['码值名称', '码值代码', '码值含义'];

function buildCodeValueHeader(extendCount = 11) {
  return [
    ...CORE_HEADERS_FOR_TEST,
    ...Array.from({ length: extendCount }, (_, i) => `扩展字段${i + 1}`),
  ];
}

function buildCodeValueExcel(rows, sheetName = '码值', { extendCount = 11 } = {}) {
  const wb = XLSX.utils.book_new();
  const matrix = [buildCodeValueHeader(extendCount), ...rows];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildCodeValueExcelWithHeader(header, rows, sheetName = '码值') {
  const wb = XLSX.utils.book_new();
  const matrix = [header, ...rows];
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

  it('imports 码值 sheet and lists by module + dict_name', () => {
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

  it('errors when 码值 sheet is missing', () => {
    const buffer = buildCodeValueExcel([['测试表', 'A', '甲']], 'Sheet1');
    assert.throws(
      () => importModuleCodeValues(buffer, { moduleCode: 'RCPMIS' }),
      /未找到 Sheet「码值」/
    );
  });

  it('imports with only core columns (no extend headers)', () => {
    const buffer = buildCodeValueExcel([['操作类型', 1, '新增']], '码值', { extendCount: 0 });
    const result = importModuleCodeValues(buffer, { moduleCode: 'RCPMIS' });
    assert.equal(result.imported, 1);
    const listed = listModuleCodeValues('RCPMIS', '操作类型');
    assert.equal(listed.items[0].extend_1, '');
  });

  it('imports with partial extend headers (trailing empty columns ignored)', () => {
    const header = ['码值名称', '码值代码', '码值含义', '扩展字段1', '扩展字段2'];
    const buffer = buildCodeValueExcelWithHeader(header, [
      ['操作类型', 1, '新增'],
      ['币种', 'CNY', '人民币', '156', 'CNY'],
    ]);
    const result = importModuleCodeValues(buffer, { moduleCode: 'RCPMIS' });
    assert.equal(result.imported, 2);
    const currency = listModuleCodeValues('RCPMIS', '币种');
    assert.equal(currency.items[0].extend_1, '156');
    assert.equal(currency.items[0].extend_2, 'CNY');
    assert.equal(currency.items[0].extend_3, '');
  });

  it('reports duplicate dict_name + code in Chinese before import', () => {
    const buffer = buildCodeValueExcel(
      [
        ['操作类型', 1, '新增'],
        ['操作类型', 1, '重复'],
        ['操作类型', 2, '变更'],
      ],
      '码值',
      { extendCount: 0 }
    );
    assert.throws(
      () => importModuleCodeValues(buffer, { moduleCode: 'RCPMIS' }),
      (err) => {
        assert.match(err.message, /重复的码值/);
        assert.match(err.message, /第 3 行与第 2 行重复/);
        assert.match(err.message, /操作类型/);
        return true;
      }
    );
    const listed = listModuleCodeValues('RCPMIS', '操作类型');
    assert.equal(listed.total, 1);
  });

  it('imports with reuse only and full module replace', () => {
    run(`INSERT OR IGNORE INTO modules (code, name, sort_order, enabled) VALUES ('IMAS', 'IMAS', 3, 1)`);
    const seed = buildCodeValueExcel([
      ['操作类型', 1, '新增'],
      ['币种', 'CNY', '人民币'],
    ]);
    importModuleCodeValues(seed, { moduleCode: 'RCPMIS' });

    const result = importModuleCodeValues(null, {
      moduleCode: 'IMAS',
      reuse: [{ sourceModule: 'RCPMIS', dictName: '币种' }],
    });
    assert.equal(result.fromReuse, 1);
    assert.equal(result.fromFile, 0);
    assert.equal(result.imported, 1);
    assert.equal(result.dictCount, 1);

    const imasCurrency = listModuleCodeValues('IMAS', '币种');
    assert.equal(imasCurrency.items[0].code, 'CNY');
    const imasDicts = listModuleCodeValueDictNames('IMAS');
    assert.equal(imasDicts.length, 1);
    assert.equal(imasDicts[0].dictName, '币种');
  });

  it('merges Excel with reuse and prefers Excel on same dict+code', () => {
    run(`INSERT OR IGNORE INTO modules (code, name, sort_order, enabled) VALUES ('IMAS', 'IMAS', 3, 1)`);
    const seed = buildCodeValueExcel([['币种', 'CNY', '人民币']]);
    importModuleCodeValues(seed, { moduleCode: 'RCPMIS' });

    const buffer = buildCodeValueExcel([['币种', 'CNY', '文件优先']]);
    const result = importModuleCodeValues(buffer, {
      moduleCode: 'IMAS',
      reuse: [{ sourceModule: 'RCPMIS', dictName: '币种' }],
    });
    assert.equal(result.fromFile, 1);
    assert.equal(result.fromReuse, 1);
    assert.equal(result.imported, 1);

    const listed = listModuleCodeValues('IMAS', '币种');
    assert.equal(listed.items[0].meaning, '文件优先');
  });

  it('rejects reuse of same dict name from different modules', () => {
    run(`INSERT OR IGNORE INTO modules (code, name, sort_order, enabled) VALUES ('YBT', 'YBT', 0, 1)`);
    importModuleCodeValues(buildCodeValueExcel([['币种', 'CNY', '人民币']]), { moduleCode: 'RCPMIS' });
    importModuleCodeValues(buildCodeValueExcel([['币种', 'USD', '美元']]), { moduleCode: 'YBT' });

    assert.throws(
      () =>
        importModuleCodeValues(null, {
          moduleCode: 'IMAS',
          reuse: [
            { sourceModule: 'RCPMIS', dictName: '币种' },
            { sourceModule: 'YBT', dictName: '币种' },
          ],
        }),
      /不能同时复用不同模块的同名码表/
    );
  });
});
