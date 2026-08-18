import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import XLSX from 'xlsx';
import { closeDb } from '../src/db/database.js';
import {
  createStandardField,
  createSubtypeVersion,
  saveFieldMappings,
  upsertSubtype,
} from '../src/services/dataset-config.js';
import { importDatasetExcel } from '../src/services/dataset-import.js';
import {
  dataItemMatchesIndicatorKey,
  lookupTestifyRulesByDocCode,
  parseIndicatorKeyFromDataItem,
} from '../src/services/testify-rule-lookup.js';
import { setupTestDb } from './helpers/fixture.js';

function buildExcel(rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, '校验规则');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('testify-rule-lookup', () => {
  before(async () => {
    await setupTestDb();
  });

  after(() => {
    closeDb();
  });

  it('parseIndicatorKeyFromDataItem 解析主指标项序号', () => {
    assert.equal(parseIndicatorKeyFromDataItem('4．存放同业款项'), '4');
    assert.equal(parseIndicatorKeyFromDataItem('4.1．境内商业银行'), '4.1');
    assert.equal(parseIndicatorKeyFromDataItem('1．各项贷款.A'), '1');
    assert.equal(parseIndicatorKeyFromDataItem('F．敞口头寸=A-B+C-D+E'), 'F');
  });

  it('dataItemMatchesIndicatorKey 仅匹配主指标项序号', () => {
    assert.equal(dataItemMatchesIndicatorKey('4．存放同业款项', '4'), true);
    assert.equal(dataItemMatchesIndicatorKey('4．存放同业款项', '4.1'), false);
    assert.equal(dataItemMatchesIndicatorKey('29．同业存放款项', '4'), false);
  });

  it('lookupTestifyRulesByDocCode 按 doc_code + 指标查规则', async () => {
    await setupTestDb();
    upsertSubtype({
      code: '1104_TESTIFY_RULE',
      name: '校验规则',
      moduleCode: '1104',
      category: 'check',
      storageKind: 'excel',
      enabled: true,
    });
    createStandardField({ code: 'reg_rule_content', label: '校验规则内容' });
    createStandardField({ code: 'testify_rule', label: '校验规则' });
    const version = createSubtypeVersion('1104_TESTIFY_RULE', {
      versionLabel: 'V20260101',
      sheetName: '校验规则',
      headerRow: 1,
      dataStartRow: 2,
      isDefault: true,
      bizKeyFields: [],
    });
    saveFieldMappings(version.id, [
      { originalColumn: '报表号', standardField: 'table_no', isRequired: true },
      { originalColumn: '主指标项', standardField: 'data_item', isRequired: true },
      { originalColumn: '校验关系内容', standardField: 'reg_rule_content', isRequired: false },
      { originalColumn: '校验关系类型', standardField: 'check_category_major', isRequired: false },
    ]);

    const buffer = buildExcel([
      ['报表号', '主指标项', '校验关系内容', '校验关系类型'],
      ['G01', '4．存放同业款项', '[4]=[4.1]+[4.2]', '表内校验关系'],
      ['G01', '25．资产总计', '[25]=[1]+[2]', '表内校验关系'],
    ]);
    importDatasetExcel(buffer, { fileName: 'rules.xlsx', versionIds: [version.id] });

    const hit = lookupTestifyRulesByDocCode('G01', '4', { versionLabel: 'V20260101' });
    assert.equal(hit.items.length, 1);
    assert.equal(hit.items[0].dataItem, '4．存放同业款项');
    assert.match(hit.items[0].regRuleContent, /\[4\]/);

    const miss = lookupTestifyRulesByDocCode('G01', '4.1');
    assert.equal(miss.items.length, 0);
  });
});
