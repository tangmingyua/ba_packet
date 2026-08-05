import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { extractSearchableCells } from '../src/services/form-template-cells.js';
import {
  importFormTemplate,
} from '../src/services/form-template-import.js';
import {
  searchFormTemplates,
  getFormTemplateSearchHits,
} from '../src/services/form-template-search.js';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import { upsertSubtype } from '../src/services/dataset-config.js';
import XLSX from 'xlsx';

describe('form-template-search-scope', () => {
  it('1104 序号行索引全部非空列', () => {
    const matrix = [
      ['表头', '项目', '子项', '备注', '员工'],
      [1, 'a', 'b', 'c', '员工甲'],
    ];
    const cells = extractSearchableCells(matrix);
    const row1 = cells.filter((c) => c.rowIndex === 1);
    assert.ok(row1.some((c) => c.colIndex === 4 && c.cellText === '员工甲'));
  });

  it('各主类统一索引矩阵全部非空列', () => {
    const matrix = [
      ['表头', '列2', '列3', '列4', '列5', '列6', '列7', '列8', '员工'],
      [1, 'a', 'b', 'c', 'd', 'e', 'f', 'g', '员工名'],
    ];
    const cells = extractSearchableCells(matrix);
    assert.ok(cells.some((c) => c.rowIndex === 0 && c.colIndex === 8 && c.cellText === '员工'));
    assert.ok(cells.some((c) => c.rowIndex === 1 && c.colIndex === 8 && c.cellText === '员工名'));
  });
});

describe('form-template-search YBT 全表', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await setupTestDb();
    upsertSubtype({
      code: 'YBT_FIELD_RULE',
      name: '字段校验规则',
      moduleCode: 'YBT',
      category: 'norm',
      storageKind: 'form_template',
      enabled: true,
      sortOrder: 300,
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['规则表', '字段1', '字段2', '字段3', '字段4', '字段5', '字段6', '字段7', '员工'],
        [1, 'x', 'x', 'x', 'x', 'x', 'x', 'x', '员工岗位'],
      ]),
      '校验规则表'
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    await importFormTemplate(buffer, {
      fileName: 'rules.xlsx',
      moduleCode: 'YBT',
      subtypeCode: 'YBT_FIELD_RULE',
    });
  });

  after(async () => {
    await teardownTestDb(tmpDir);
  });

  it('搜索员工可命中第九列', () => {
    const list = searchFormTemplates('员工', { moduleCode: 'YBT' });
    assert.ok(list.totalHits >= 1);
    const tpl = list.items[0];
    const detail = getFormTemplateSearchHits(tpl.id, '员工');
    assert.ok(detail.hits.some((h) => h.col === 8 && String(h.text).includes('员工')));
  });
});
