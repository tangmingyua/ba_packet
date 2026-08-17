import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import XLSX from 'xlsx';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import {
  createSubtypeVersion,
  getDatasetCatalog,
  saveFieldMappings,
  updateSubtype,
  upsertSubtype,
} from '../src/services/dataset-config.js';
import { hasDatasetHitsInModule } from '../src/services/dataset-search.js';
import { importDatasetExcel } from '../src/services/dataset-import.js';
import { importFormTemplate, listFormTemplates } from '../src/services/form-template-import.js';
import { getModuleCategoryStats, getModuleSubtypeStats } from '../src/services/module-browse.js';
import { unifiedSearch } from '../src/services/unified-search.js';
import { browseFormTemplateCatalog } from '../src/services/form-template-catalog-browse.js';
import {
  formTemplateReportCodesMatch,
  normalizeFormTemplateReportCode,
} from '../src/utils/form-template-report-code.js';
import { compareVersionLabelsDesc } from '../src/utils/version-sort.js';

const CATALOG_ONLY_MARK = '仅目录独有词XYZ';

function buildExcel(name, rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildFormTemplateWorkbook(sheetName, title, indicator) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[title], [indicator]]), sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function catalogCodes(result) {
  const codes = [];
  for (const report of result.reports || []) {
    for (const block of report.blocks || []) {
      for (const item of block.items || []) {
        codes.push(item.payload?.table_no);
      }
    }
  }
  return codes;
}

function pickLatestFormTemplate(items, reportCode) {
  const matched = (items || []).filter((item) =>
    formTemplateReportCodesMatch(item.reportCode, reportCode)
  );
  if (!matched.length) return null;
  return [...matched].sort((a, b) => compareVersionLabelsDesc(a.versionLabel, b.versionLabel))[0];
}

describe('form-template-catalog-browse', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await setupTestDb();
    updateSubtype('1104_FORM_TEMPLATE', { enabled: true });

    upsertSubtype({
      code: '1104_FORM_CATALOG',
      name: '表样目录',
      moduleCode: '1104',
      category: 'norm',
      storageKind: 'excel',
      enabled: true,
      sortOrder: 199,
    });
    const version = createSubtypeVersion('1104_FORM_CATALOG', {
      versionLabel: 'V1',
      sheetName: '目录',
      headerRow: 1,
      dataStartRow: 2,
      isDefault: true,
    });
    saveFieldMappings(version.id, [
      { originalColumn: '表号', standardField: 'table_no', isRequired: true, defaultDisplay: true },
      { originalColumn: '表名', standardField: 'table_name', isRequired: false, defaultDisplay: true },
      {
        originalColumn: '备注',
        standardField: 'data_element_desc',
        isRequired: false,
        defaultDisplay: true,
      },
    ]);
    importDatasetExcel(
      buildExcel('目录', [
        ['表号', '表名', '备注'],
        ['G01', '资产负债项目统计表', CATALOG_ONLY_MARK],
        ['G04', '利润表', ''],
        ['G99', '尚未导入的表', ''],
      ]),
      { fileName: 'catalog.xlsx', versionIds: [version.id] }
    );

    await importFormTemplate(
      buildFormTemplateWorkbook('G01_231', 'G01资产负债项目统计表', '1. 各项贷款'),
      {
        fileName: 'G01-logic_231.xlsx',
        moduleCode: '1104',
        subtypeCode: '1104_FORM_TEMPLATE',
      }
    );
    await importFormTemplate(
      buildFormTemplateWorkbook('G01_241', 'G01资产负债项目统计表', '1. 各项贷款'),
      {
        fileName: 'G01-logic_241.xlsx',
        moduleCode: '1104',
        subtypeCode: '1104_FORM_TEMPLATE',
      }
    );
    await importFormTemplate(
      buildFormTemplateWorkbook('G04_231', 'G04利润表', '1. 营业收入'),
      {
        fileName: 'G04-logic_231.xlsx',
        moduleCode: '1104',
        subtypeCode: '1104_FORM_TEMPLATE',
      }
    );
  });

  after(async () => teardownTestDb(tmpDir));

  it('normalize / match 表号忽略 _231 后缀', () => {
    assert.equal(normalizeFormTemplateReportCode('G01_231'), 'G01');
    assert.equal(formTemplateReportCodesMatch('G01', 'G01_231'), true);
    assert.equal(formTemplateReportCodesMatch('G01', 'G04'), false);
  });

  it('查询页不展示「表样目录」子类，统计不含其记录', () => {
    const subtypes = getModuleSubtypeStats('1104');
    assert.equal(subtypes.some((s) => s.name === '表样目录'), false);
    assert.ok(subtypes.some((s) => s.code === '1104_FORM_TEMPLATE'));

    const stats = getModuleCategoryStats('1104');
    const norm = stats.find((s) => s.code === 'norm');
    assert.ok(norm);
    assert.equal(norm.count, 3);
  });

  it('资料导入目录仍能看到「表样目录」', () => {
    const catalog = getDatasetCatalog();
    assert.ok(catalog.subtypes.some((s) => s.name === '表样目录' && s.code === '1104_FORM_CATALOG'));
  });

  it('统一检索不会把「表样目录」当成独立结果', () => {
    const result = unifiedSearch('', { mode: 'norm', moduleCode: '1104' });
    assert.equal(
      (result.reports || []).some((r) => r.name === '表样目录' || r.code === '1104_FORM_CATALOG'),
      false
    );
  });

  it('模块命中探测不把目录独有词算进去', () => {
    assert.equal(
      hasDatasetHitsInModule(CATALOG_ONLY_MARK, { mode: 'norm', moduleCode: '1104' }),
      false
    );
  });

  it('无关键词返回全部目录行，表号可跳转', () => {
    const result = browseFormTemplateCatalog({ moduleCode: '1104' });
    assert.equal(result.found, true);
    assert.equal(result.reportCodeColumn, '表号');
    const codes = catalogCodes(result).sort();
    assert.deepEqual(codes, ['G01', 'G04', 'G99']);
    for (const report of result.reports) {
      for (const block of report.blocks || []) {
        for (const item of block.items || []) {
          assert.deepEqual(item.payload?.__form_template_link_fields, ['table_no']);
        }
      }
    }
  });

  it('有关键词按表样命中过滤目录表号，而不是搜目录文本', () => {
    const byTemplate = browseFormTemplateCatalog({
      moduleCode: '1104',
      keyword: '贷款',
      formTemplateSubtypeCode: '1104_FORM_TEMPLATE',
    });
    assert.equal(byTemplate.found, true);
    assert.deepEqual(catalogCodes(byTemplate), ['G01']);

    const byCatalogText = browseFormTemplateCatalog({
      moduleCode: '1104',
      keyword: CATALOG_ONLY_MARK,
      formTemplateSubtypeCode: '1104_FORM_TEMPLATE',
    });
    assert.equal(byCatalogText.found, true);
    assert.deepEqual(catalogCodes(byCatalogText), []);
  });

  it('同表号多版本默认取最新，目录有而库中无则匹配不到', () => {
    const items = listFormTemplates({
      moduleCode: '1104',
      subtypeCode: '1104_FORM_TEMPLATE',
    });
    const latest = pickLatestFormTemplate(items, 'G01');
    assert.ok(latest);
    assert.equal(normalizeFormTemplateReportCode(latest.reportCode), 'G01');
    assert.equal(latest.versionLabel, '241');
    assert.equal(pickLatestFormTemplate(items, 'G99'), null);
  });

  it('停用的表样目录仍作为查询入口', () => {
    updateSubtype('1104_FORM_CATALOG', { enabled: false });
    try {
      const result = browseFormTemplateCatalog({ moduleCode: '1104' });
      assert.equal(result.found, true);
      assert.deepEqual(catalogCodes(result).sort(), ['G01', 'G04', 'G99']);
    } finally {
      updateSubtype('1104_FORM_CATALOG', { enabled: true });
    }
  });

  it('目录 Excel 为空时用已导入表样生成目录', () => {
    updateSubtype('1104_FORM_CATALOG', { name: '表样目录-临时' });
    try {
      const result = browseFormTemplateCatalog({
        moduleCode: '1104',
        formTemplateSubtypeCode: '1104_FORM_TEMPLATE',
      });
      assert.equal(result.found, true);
      const codes = catalogCodes(result);
      assert.equal(codes.some((c) => formTemplateReportCodesMatch(c, 'G01')), true);
      assert.equal(codes.some((c) => formTemplateReportCodesMatch(c, 'G04')), true);
      assert.equal(codes.includes('G99'), false);
      const g01 = pickLatestFormTemplate(
        listFormTemplates({ moduleCode: '1104', subtypeCode: '1104_FORM_TEMPLATE' }),
        'G01'
      );
      assert.ok(codes.includes(g01.reportCode));
    } finally {
      updateSubtype('1104_FORM_CATALOG', { name: '表样目录' });
    }
  });

  it('未配置目录入口的主类 found=false', () => {
    const result = browseFormTemplateCatalog({ moduleCode: 'YBT' });
    assert.equal(result.found, false);
  });
});
