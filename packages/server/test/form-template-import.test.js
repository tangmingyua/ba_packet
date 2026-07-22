/** 1104 表样导入测试 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import { buildApp, getApiToken } from '../src/index.js';
import {
  deleteFormTemplate,
  getFormTemplate,
  importFormTemplate,
  isFormTemplateReportCode,
  isLogicCell,
  listFormTemplates,
  parseFormTemplate,
  parseFormTemplateWorkbook,
  resolveFormTemplateVersionLabel,
  parseFormTemplateSheetMeta,
  parseFileNameMeta,
  trimTrailingEmptyRows,
  findLastContentRow,
} from '../src/services/form-template-import.js';
import { countCellsForTemplate } from '../src/services/form-template-cells.js';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = path.resolve(__dirname, '../../../参考/汇总指标案例');

function readSample(name) {
  return fs.readFileSync(path.join(SAMPLE_DIR, name));
}

function buildMultiSheetWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['G01资产负债项目统计表'], ['1. 现金']]),
    'G0100'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['G02表'], ['表一：业务量']]),
    'G0200'
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['说明页']]), '说明');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Sheet 名带中文后缀；文件名误用单表命名 */
function buildMultiSheetWorkbookWithSuffixNames() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['G01资产负债项目统计表'], ['1. 现金']]),
    'G0300资产负债项目统计表'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['G04表'], ['表一：业务量']]),
    'G0400衍生产品'
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['说明页']]), '说明');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${getApiToken()}`, ...extra };
}

describe('form-template-import', () => {
  let tmpDir;
  let app;

  before(async () => {
    tmpDir = await setupTestDb();
    app = await buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
    await teardownTestDb(tmpDir);
  });

  it('isLogicCell 识别逻辑公式', () => {
    assert.equal(isLogicCell("加总(科目数据表.当前人民币余额)|数据来源='GL'"), true);
    assert.equal(isLogicCell('1. 现金'), false);
    assert.equal(isLogicCell('表一：业务量'), false);
  });

  it('trimTrailingEmptyRows 裁掉末尾空行', () => {
    const matrix = [
      ['标题', ''],
      ['1. 现金', ''],
      ['', ''],
      [null, null],
    ];
    const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    const result = trimTrailingEmptyRows(matrix, merges);

    assert.equal(result.rowCount, 2);
    assert.equal(result.matrix.length, 2);
    assert.equal(findLastContentRow(matrix, merges), 1);
  });

  it('trimTrailingEmptyRows 保留 merge 覆盖的空行', () => {
    const matrix = [
      ['标题', ''],
      ['', ''],
      ['', ''],
      ['', ''],
      ['', ''],
    ];
    const merges = [{ s: { r: 0, c: 0 }, e: { r: 2, c: 1 } }];
    const result = trimTrailingEmptyRows(matrix, merges);

    assert.equal(result.rowCount, 3);
    assert.equal(result.merges[0].e.r, 2);
  });

  it('parseFormTemplate G0100 元数据与 merges', () => {
    const buffer = readSample('G0100-logic_231.xls');
    const parsed = parseFormTemplate(buffer, { fileName: 'G0100-logic_231.xls' });

    assert.equal(parsed.reportCode, 'G0100');
    assert.equal(parsed.versionLabel, '231');
    assert.equal(parsed.reportTitle, 'G01资产负债项目统计表');
    assert.equal(parsed.sheetName, 'G0100');
    assert.equal(parsed.rowCount, 151);
    assert.ok(parsed.rowCount < 164, '应裁掉末尾空行');
    assert.equal(parsed.merges.length, 8);
    assert.equal(parsed.fileNameMatched, true);

    const cashRow = parsed.matrix.find((row) => String(row[1] || '').includes('1. 现金'));
    assert.ok(cashRow);
    assert.equal(cashRow[2], '');
    assert.ok(parsed.matrix.some((row) => String(row[1] || '').includes('Ⅰ. 资产')));
  });

  it('parseFormTemplate G0200 分表标题保留', () => {
    const buffer = readSample('G0200-logic_241.xls');
    const parsed = parseFormTemplate(buffer, { fileName: 'G0200-logic_241.xls' });

    assert.equal(parsed.reportCode, 'G0200');
    assert.equal(parsed.versionLabel, '241');
    assert.equal(parsed.merges.length, 135);

    const flat = parsed.matrix.flat().filter(Boolean).map(String);
    assert.ok(flat.some((t) => t.includes('表一：业务量')));
    assert.ok(flat.some((t) => t.includes('1.1买入期权')));

    for (const row of parsed.matrix) {
      for (const cell of row) {
        assert.equal(isLogicCell(cell), false);
      }
    }
  });

  it('isFormTemplateReportCode 识别 G/S 表 Sheet 名', () => {
    assert.equal(isFormTemplateReportCode('G0100'), true);
    assert.equal(isFormTemplateReportCode('G0100_231'), true);
    assert.equal(isFormTemplateReportCode('G0100资产负债'), true);
    assert.equal(isFormTemplateReportCode('G4A00X2_241'), true);
    assert.equal(isFormTemplateReportCode('S2400_201'), true);
    assert.equal(isFormTemplateReportCode('说明'), false);
    assert.equal(isFormTemplateReportCode('目录'), false);
  });

  it('parseFormTemplateSheetMeta 解析整合版 Sheet 名', () => {
    assert.deepEqual(parseFormTemplateSheetMeta('G0100_231'), {
      reportCode: 'G0100',
      versionLabel: '231',
    });
    assert.deepEqual(parseFormTemplateSheetMeta('G0101a_231'), {
      reportCode: 'G0101A',
      versionLabel: '231',
    });
    assert.deepEqual(parseFormTemplateSheetMeta('G4A00X2_241'), {
      reportCode: 'G4A00X2',
      versionLabel: '241',
    });
    assert.deepEqual(parseFormTemplateSheetMeta('G4400X2'), {
      reportCode: 'G4400X2',
      versionLabel: null,
    });
    assert.deepEqual(parseFormTemplateSheetMeta('G1700-221（非最新）'), {
      reportCode: 'G1700',
      versionLabel: '221',
    });
    assert.deepEqual(parseFormTemplateSheetMeta('S2400_201'), {
      reportCode: 'S2400',
      versionLabel: '201',
    });
    assert.equal(resolveFormTemplateVersionLabel(parseFormTemplateSheetMeta('G4400X2'), null), '');
    assert.equal(
      resolveFormTemplateVersionLabel(parseFormTemplateSheetMeta('G0100'), {
        reportCode: 'G0100',
        versionLabel: '231',
      }),
      '231'
    );
    assert.equal(parseFileNameMeta('1104汇总总表-整合版-20260428.xlsx'), null);
  });

  it('importFormTemplate 入库且拒绝重复导入', () => {
    const buffer = readSample('G0100-logic_231.xls');
    const first = importFormTemplate(buffer, { fileName: 'G0100-logic_231.xls' });
    assert.ok(first.id > 0);

    const g0100Items = listFormTemplates().filter(
      (x) => x.reportCode === 'G0100' && x.versionLabel === '231'
    );
    assert.equal(g0100Items.length, 1);

    assert.throws(
      () => importFormTemplate(buffer, { fileName: 'G0100-logic_231.xls' }),
      /已存在，请先删除/
    );
    assert.equal(
      listFormTemplates().filter((x) => x.reportCode === 'G0100' && x.versionLabel === '231').length,
      1
    );

    const detail = getFormTemplate(first.id);
    assert.ok(Array.isArray(detail.matrix));
    assert.equal(detail.merges.length, 8);
    assert.ok(countCellsForTemplate(first.id) > 0);
  });

  it('parseFormTemplateWorkbook 多 Sheet 按表号导入', () => {
    const buffer = buildMultiSheetWorkbook();
    const parsed = parseFormTemplateWorkbook(buffer, { fileName: 'logic_888.xlsx' });

    assert.equal(parsed.sheets.length, 2);
    assert.deepEqual(
      parsed.sheets.map((s) => s.reportCode).sort(),
      ['G0100', 'G0200']
    );
    assert.equal(parsed.sheets[0].versionLabel, '');
    assert.equal(parsed.sheets[1].versionLabel, '');
    assert.equal(parsed.skipped.length, 0);
  });

  it('importFormTemplate 多 Sheet 一次入库', () => {
    const buffer = buildMultiSheetWorkbook();
    const result = importFormTemplate(buffer, { fileName: 'logic_888.xlsx' });

    assert.equal(result.sheetCount, 2);
    assert.equal(result.imported, 2);
    assert.equal(result.items.length, 2);
    assert.ok(listFormTemplates().some((x) => x.reportCode === 'G0100' && x.versionLabel === ''));
    assert.ok(listFormTemplates().some((x) => x.reportCode === 'G0200' && x.versionLabel === ''));

    assert.throws(
      () => importFormTemplate(buffer, { fileName: 'logic_888.xlsx' }),
      /已存在，请先删除/
    );
  });

  it('多 Sheet：Sheet 名带中文后缀仍全部导入', () => {
    const buffer = buildMultiSheetWorkbookWithSuffixNames();
    const parsed = parseFormTemplateWorkbook(buffer, { fileName: 'logic_999.xlsx' });
    assert.equal(parsed.sheets.length, 2);
    assert.deepEqual(
      parsed.sheets.map((s) => s.reportCode).sort(),
      ['G0300', 'G0400']
    );

    const result = importFormTemplate(buffer, { fileName: 'logic_999.xlsx' });
    assert.equal(result.imported, 2);
  });

  it('多 Sheet：文件名是单表格式时仍解析全部表号 Sheet', () => {
    const buffer = buildMultiSheetWorkbook();
    const parsed = parseFormTemplateWorkbook(buffer, { fileName: 'G0100-logic_777.xlsx' });
    assert.equal(parsed.sheets.length, 2, '不应因文件名只导 G0100');
    assert.deepEqual(
      parsed.sheets.map((s) => s.reportCode).sort(),
      ['G0100', 'G0200']
    );
    const byCode = Object.fromEntries(parsed.sheets.map((s) => [s.reportCode, s.versionLabel]));
    assert.equal(byCode.G0100, '777');
    assert.equal(byCode.G0200, '');
  });

  it('POST /api/form-template/import', async () => {
    const buffer = readSample('G0200-logic_241.xls');
    const boundary = '----formtest';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="G0200-logic_241.xls"\r\nContent-Type: application/vnd.ms-excel\r\n\r\n`
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/form-template/import',
      headers: {
        ...authHeaders(),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.equal(json.reportCode, 'G0200');
    assert.equal(json.rowCount, 104);
  });

  it('GET /api/form-templates 与 GET /api/form-templates/:id', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/form-templates',
      headers: authHeaders(),
    });
    assert.equal(listRes.statusCode, 200);
    const { items } = listRes.json();
    assert.ok(items.length >= 2);

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/form-templates/${items[0].id}`,
      headers: authHeaders(),
    });
    assert.equal(detailRes.statusCode, 200);
    const detail = detailRes.json();
    assert.ok(detail.matrix.length > 0);
    assert.ok(Array.isArray(detail.merges));
  });

  it('deleteFormTemplate 删除表样与 cells', () => {
    const items = listFormTemplates();
    assert.ok(items.length >= 1);
    const target = items[0];
    assert.ok(countCellsForTemplate(target.id) > 0);

    const result = deleteFormTemplate(target.id);
    assert.equal(result.ok, true);
    assert.equal(getFormTemplate(target.id), null);
    assert.equal(countCellsForTemplate(target.id), 0);
    assert.ok(listFormTemplates().length < items.length);
  });

  it('DELETE /api/form-templates/:id', async () => {
    const items = listFormTemplates();
    assert.ok(items.length >= 1);
    const target = items[items.length - 1];

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/form-templates/${target.id}`,
      headers: authHeaders(),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().reportCode, target.reportCode);

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/form-templates/${target.id}`,
      headers: authHeaders(),
    });
    assert.equal(detailRes.statusCode, 404);
  });
});
