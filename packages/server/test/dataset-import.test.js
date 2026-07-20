/**
 * 新模型：配置驱动导入与搜索测试
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import XLSX from 'xlsx';
import { closeDb, queryOne } from '../src/db/database.js';
import {
  createSubtypeVersion,
  deleteSubtypeVersion,
  getDatasetCatalog,
  listFieldMappings,
  saveFieldMappings,
  updateSubtype,
} from '../src/services/dataset-config.js';
import { importDatasetExcel, validateHeaders } from '../src/services/dataset-import.js';
import { searchDatasetRecords, suggestDatasetItems } from '../src/services/dataset-search.js';
import { setupTestDb } from './helpers/fixture.js';

function buildExcel(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('dataset import model', () => {
  let versionId;

  before(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await setupTestDb();
    updateSubtype('TO_EAST_FAQ', { name: '转EAST问答', enabled: true, sortOrder: 4 });
    const version = createSubtypeVersion('TO_EAST_FAQ', {
      versionLabel: 'v1',
      sheetName: '转EAST问答',
      headerRow: 1,
      dataStartRow: 2,
      isDefault: true,
      bizKeyFields: [],
    });
    versionId = version.id;
    saveFieldMappings(versionId, [
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
    ]);
  });

  after(() => {
    closeDb();
  });

  it('表头多余列导致校验失败', () => {
    const mappings = [
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
    ];
    const result = validateHeaders(['数据项名称', '多余列'], mappings);
    assert.equal(result.ok, false);
    assert.match(result.message, /多余列/);
  });

  it('缺可选列可通过，缺必填列失败', () => {
    const mappings = [
      { originalColumn: '采集范围', standardField: 'collection_scope', isRequired: true },
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
    ];
    assert.equal(validateHeaders(['数据项名称', '采集范围'], mappings).ok, true);
    assert.equal(validateHeaders(['数据项名称'], mappings).ok, false);
  });

  it('数据项可为空且非必填', () => {
    saveFieldMappings(versionId, [
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
      { originalColumn: '备注', standardField: 'collection_scope', isRequired: false },
    ]);
    const buffer = buildExcel([
      {
        name: '转EAST问答',
        rows: [
          ['数据项名称', '备注'],
          ['', '仅有备注'],
        ],
      },
    ]);
    const result = importDatasetExcel(buffer, { fileName: 'east.xlsx', versionIds: [versionId] });
    assert.equal(result.summary.success, 1);
    assert.equal(result.summary.inserted, 1);
  });

  it('重复导入会替换该版本原有数据', () => {
    const buffer1 = buildExcel([
      { name: '转EAST问答', rows: [['数据项名称'], ['OLD_ITEM_XYZ'], ['OLD_ITEM_ABC']] },
    ]);
    importDatasetExcel(buffer1, { fileName: 'first.xlsx', versionIds: [versionId] });
    let count = Number(
      queryOne('SELECT COUNT(*) AS c FROM data_records WHERE subtype_version_id = ?', [versionId])?.c
    );
    assert.equal(count, 2);

    const buffer2 = buildExcel([
      { name: '转EAST问答', rows: [['数据项名称'], ['NEW_ITEM_ONLY']] },
    ]);
    const result = importDatasetExcel(buffer2, { fileName: 'second.xlsx', versionIds: [versionId] });
    assert.equal(result.summary.success, 1);
    assert.equal(result.summary.inserted, 1);
    count = Number(
      queryOne('SELECT COUNT(*) AS c FROM data_records WHERE subtype_version_id = ?', [versionId])?.c
    );
    assert.equal(count, 1);
    const search = searchDatasetRecords('NEW_ITEM_ONLY');
    assert.ok(search.reports[0]?.hitCount >= 1);
    const searchOld = searchDatasetRecords('OLD_ITEM_XYZ');
    assert.equal(searchOld.reports.reduce((n, r) => n + r.hitCount, 0), 0);
  });

  it('成功导入 sheet 并可搜索 / 联想', () => {
    const buffer = buildExcel([
      {
        name: '转EAST问答',
        rows: [
          ['数据项名称'],
          ['贷款金额'],
          ['客户名称'],
        ],
      },
      {
        name: '无关Sheet',
        rows: [['x'], ['y']],
      },
    ]);

    const result = importDatasetExcel(buffer, {
      fileName: 'east.xlsx',
      versionIds: [versionId],
    });

    assert.equal(result.summary.success, 1);
    assert.equal(result.summary.skipped, 1);
    assert.equal(result.summary.inserted, 2);

    const suggest = suggestDatasetItems('贷款');
    assert.ok(suggest.items.some((i) => i.dataItemName === '贷款金额'));

    const search = searchDatasetRecords('贷款');
    assert.equal(search.reports.length, 1);
    assert.equal(search.reports[0].layout, 'dataset');
    assert.ok(search.reports[0].hitCount >= 1);
    assert.ok(search.fieldMappingsByVersion[String(versionId)]);
    assert.equal(search.fieldMappingsByVersion[String(versionId)].data_item, '数据项名称');
    assert.ok(Array.isArray(search.fieldMappingDefaultDisplayByVersion[String(versionId)]));
    assert.equal(search.reports[0].blocks[0].items[0].subtypeVersionId, versionId);
  });

  it('一 sheet 失败不影响另一 sheet 成功', () => {
    updateSubtype('YBT_FAQ', { name: '一表通制度问答', enabled: true, sortOrder: 1 });
    const v2 = createSubtypeVersion('YBT_FAQ', {
      versionLabel: 'v1',
      sheetName: '一表通制度问答',
      bizKeyFields: [],
    });
    saveFieldMappings(v2.id, [
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
    ]);

    const buffer = buildExcel([
      {
        name: '转EAST问答',
        rows: [
          ['数据项名称', '多余列'],
          ['贷款金额', 'x'],
        ],
      },
      {
        name: '一表通制度问答',
        rows: [
          ['数据项名称'],
          ['合同号'],
        ],
      },
    ]);

    const result = importDatasetExcel(buffer, {
      fileName: 'multi.xlsx',
      versionIds: [versionId, v2.id],
    });

    const east = result.sheets.find((s) => s.sheetName === '转EAST问答');
    const faq = result.sheets.find((s) => s.sheetName === '一表通制度问答');
    assert.equal(east.status, 'failed');
    assert.equal(faq.status, 'success');

    const search = searchDatasetRecords('合同');
    assert.ok(search.reports.some((r) => r.code === 'YBT_FAQ'));
  });

  it('catalog 含标准字段与子类', () => {
    const catalog = getDatasetCatalog();
    assert.ok(catalog.modules.some((m) => m.code === 'YBT'));
    assert.ok(catalog.standardFields.some((f) => f.code === 'data_item'));
    assert.ok(catalog.standardFields.some((f) => f.code === 'east_table_name'));
    assert.ok(catalog.standardFields.some((f) => f.code === 'east_field_name'));
    assert.ok(catalog.standardFields.some((f) => f.code === 'question_desc'));
    assert.ok(catalog.standardFields.length >= 50);
    assert.ok(catalog.subtypes.some((s) => s.code === 'TO_EAST_FAQ'));
    assert.equal(catalog.categories.length, 5);
    const east = catalog.subtypes.find((s) => s.code === 'TO_EAST_FAQ');
    assert.equal(east.category, 'qa');
    assert.equal(east.categoryLabel, '答疑');
    assert.equal(east.moduleCode, 'YBT');
    assert.equal(east.moduleName, '一表通');
  });

  it('搜索 mode 按规范/答疑过滤', () => {
    const buffer = buildExcel([
      { name: '转EAST问答', rows: [['数据项名称'], ['贷款协议ID']] },
    ]);
    importDatasetExcel(buffer, { fileName: 'east.xlsx', versionIds: [versionId] });

    const qaOnly = searchDatasetRecords('贷款', { mode: 'qa' });
    assert.ok(qaOnly.reports.length >= 1);
    assert.equal(qaOnly.reports[0].category, 'qa');
    assert.equal(qaOnly.reports[0].moduleCode, 'YBT');
    assert.equal(qaOnly.reports[0].moduleName, '一表通');
    assert.equal(qaOnly.reports[0].blocks[0].items[0].categoryLabel, '答疑');

    const normOnly = searchDatasetRecords('贷款', { mode: 'norm' });
    assert.equal(normOnly.reports.length, 0);

    const aggregate = searchDatasetRecords('贷款', { mode: 'aggregate' });
    assert.ok(aggregate.reports.length >= 1);

    const qaAggregate = searchDatasetRecords('贷款', { mode: 'aggregate', categories: ['qa'] });
    assert.ok(qaAggregate.reports.length >= 1);
    assert.equal(qaAggregate.reports[0].category, 'qa');

    const normAggregate = searchDatasetRecords('贷款', { mode: 'aggregate', categories: ['norm'] });
    assert.equal(normAggregate.reports.length, 0);
  });

  it('查答疑可按表名、问题描述搜索', () => {
    saveFieldMappings(versionId, [
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
      { originalColumn: '表名', standardField: 'table_name', isRequired: false },
      { originalColumn: '具体问题描述', standardField: 'question_desc', isRequired: false },
    ]);
    const buffer = buildExcel([
      {
        name: '转EAST问答',
        rows: [
          ['数据项名称', '表名', '具体问题描述'],
          ['无关数据项', '对公信贷业务借据表', '贷款状态如何填报'],
        ],
      },
    ]);
    importDatasetExcel(buffer, { fileName: 'east.xlsx', versionIds: [versionId] });

    assert.ok(searchDatasetRecords('对公信贷', { mode: 'qa' }).reports[0]?.hitCount >= 1);
    assert.ok(searchDatasetRecords('贷款状态如何', { mode: 'qa' }).reports[0]?.hitCount >= 1);
    assert.equal(searchDatasetRecords('不存在的关键词XYZ', { mode: 'qa' }).reports.length, 0);
    assert.equal(searchDatasetRecords('贷款状态如何', { mode: 'norm' }).reports.length, 0);
  });

  it('查规范可按表名、填报规范搜索', () => {
    updateSubtype('YBT_NORM', { name: '一表通制度规范', enabled: true, sortOrder: 0 });
    const normVersion = createSubtypeVersion('YBT_NORM', {
      versionLabel: 'v1',
      sheetName: '一表通制度规范',
      headerRow: 1,
      dataStartRow: 2,
      isDefault: true,
      bizKeyFields: [],
    });
    saveFieldMappings(normVersion.id, [
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
      { originalColumn: '表名', standardField: 'table_name', isRequired: false },
      { originalColumn: '数据元说明', standardField: 'data_element_desc', isRequired: false },
    ]);
    const buffer = buildExcel([
      {
        name: '一表通制度规范',
        rows: [
          ['数据项名称', '表名', '数据元说明'],
          ['客户编号', '客户基本信息表', '填报规范示例文本ABC'],
        ],
      },
    ]);
    importDatasetExcel(buffer, { fileName: 'norm.xlsx', versionIds: [normVersion.id] });

    assert.ok(searchDatasetRecords('客户基本信息', { mode: 'norm' }).reports[0]?.hitCount >= 1);
    assert.ok(searchDatasetRecords('填报规范示例', { mode: 'norm' }).reports[0]?.hitCount >= 1);
    assert.equal(searchDatasetRecords('填报规范示例', { mode: 'qa' }).reports.length, 0);
  });

  it('字段映射按保存顺序读取', () => {
    saveFieldMappings(versionId, [
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: false },
      { originalColumn: '采集范围', standardField: 'collection_scope', isRequired: false },
    ]);
    let mappings = listFieldMappings(versionId);
    assert.equal(mappings[0].originalColumn, '数据项名称');
    assert.equal(mappings[1].originalColumn, '采集范围');

    saveFieldMappings(versionId, [
      { originalColumn: '采集范围', standardField: 'collection_scope', isRequired: false },
      { originalColumn: '数据项名称', standardField: 'data_item', isRequired: true },
    ]);
    mappings = listFieldMappings(versionId);
    assert.equal(mappings[0].originalColumn, '采集范围');
    assert.equal(mappings[1].originalColumn, '数据项名称');
  });

  it('仅启用子类、无版本时跳过并提示创建版本', () => {
    deleteSubtypeVersion(versionId);
    updateSubtype('TO_EAST_FAQ', { name: '转EAST问答', enabled: true, sortOrder: 4 });
    const buffer = buildExcel([
      { name: '转EAST问答', rows: [['数据项名称'], ['测试']] },
    ]);
    const result = importDatasetExcel(buffer, { fileName: 'east.xlsx' });
    assert.equal(result.summary.skipped, 1);
    assert.match(result.sheets[0].message, /尚未创建版本/);
  });
});

describe('standard fields config', () => {
  before(async () => {
    await setupTestDb();
  });

  after(() => {
    closeDb();
  });

  it('可添加并删除自定义标准字段', async () => {
    const { createStandardField, deleteStandardField, listStandardFields } = await import(
      '../src/services/dataset-config.js'
    );
    const created = createStandardField({ code: 'test_custom_field', label: '测试字段' });
    assert.equal(created.code, 'test_custom_field');
    deleteStandardField('test_custom_field');
    const list = listStandardFields();
    assert.ok(!list.some((f) => f.code === 'test_custom_field'));
  });

  it('系统字段不可删除', async () => {
    const { deleteStandardField } = await import('../src/services/dataset-config.js');
    assert.throws(() => deleteStandardField('data_item'), /不可删除/);
  });
});
