/**
 * 聚合浏览索引
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import XLSX from 'xlsx';
import { closeDb } from '../src/db/database.js';
import {
  createSubtypeVersion,
  saveFieldMappings,
  updateSubtype,
  upsertSubtype,
} from '../src/services/dataset-config.js';
import { buildAggregateBrowseIndex } from '../src/services/aggregate-browse.js';
import { importDatasetExcel } from '../src/services/dataset-import.js';
import { unifiedSearch } from '../src/services/unified-search.js';
import { setupTestDb } from './helpers/fixture.js';

function buildExcel(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('aggregate browse', () => {
  let versionId;
  let subtypeCode;

  before(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await setupTestDb();
    upsertSubtype({
      code: 'NORM_SAMPLE',
      name: '规范样例',
      enabled: true,
      category: 'norm',
      moduleCode: 'YBT',
      storageKind: 'excel',
      sortOrder: 1,
    });
    subtypeCode = 'NORM_SAMPLE';
    const version = createSubtypeVersion(subtypeCode, {
      versionLabel: 'v1',
      sheetName: '规范',
      headerRow: 1,
      dataStartRow: 2,
      isDefault: true,
      bizKeyFields: [],
    });
    versionId = version.id;
    saveFieldMappings(versionId, [
      { originalColumn: '表名', standardField: 'table_name', aggregateDisplay: true },
      { originalColumn: '数据项', standardField: 'data_item', aggregateDisplay: true },
      { originalColumn: '说明', standardField: 'data_element_desc', isRequired: false },
    ]);

    const buffer = buildExcel([
      {
        name: '规范',
        rows: [
          ['表名', '数据项', '说明'],
          ['A表', '字段1', 'x1'],
          ['A表', '字段2', 'x2'],
          ['B表', '字段1', 'y1'],
        ],
      },
    ]);
    importDatasetExcel(buffer, { fileName: 'norm.xlsx', versionIds: [versionId] });
  });

  after(() => {
    closeDb();
  });

  it('按聚合展示列组合去重', () => {
    const index = buildAggregateBrowseIndex({
      subtypeCode,
      moduleCode: 'YBT',
      mode: 'norm',
    });
    assert.equal(index.columns.length, 3);
    assert.ok(index.columns.some((c) => c.code === 'version'));
    assert.equal(index.items.length, 3);
    const a1 = index.items.find((r) => r.values['表名'] === 'A表' && r.values['数据项'] === '字段1');
    assert.equal(a1?.count, 1);
    assert.equal(a1.filters.find((f) => f.col === '表名').op, 'eq');
    assert.equal(a1.filters.find((f) => f.col === '表名').val, 'A表');
  });

  it('无聚合列时返回 null', () => {
    saveFieldMappings(versionId, [
      { originalColumn: '数据项', standardField: 'data_item', isRequired: false },
    ]);
    const index = buildAggregateBrowseIndex({
      subtypeCode,
      moduleCode: 'YBT',
      mode: 'norm',
    });
    assert.equal(index, null);
  });

  it('unifiedSearch 空关键词返回 aggregateBrowse', () => {
    const res = unifiedSearch('', {
      mode: 'aggregate',
      moduleCode: 'YBT',
      subtypeCode,
      categories: 'norm',
    });
    assert.ok(res.aggregateBrowse?.items?.length >= 3);
  });
});
