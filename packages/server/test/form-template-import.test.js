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
  FORM_TEMPLATE_LATEST_VERSION,
  trimTrailingEmptyRows,
  trimTrailingEmptyCols,
  trimMatrixPadding,
  findLastContentRow,
  findLastContentCol,
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
    'G0100_'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['G02表'], ['表一：业务量']]),
    'G0200_'
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['说明页']]), '说明_');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Sheet 名带版本，文件名误用单表命名 */
function buildMultiSheetWorkbookWithVersionNames() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['G01资产负债项目统计表'], ['1. 现金']]),
    'G0300_999'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['G04表'], ['表一：业务量']]),
    'G0400_999'
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['说明页']]), '说明_');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Sheet 名以中文开头且含「_」，文件名含表号 */
function buildChineseSheetWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['G01资产负债项目统计表'], ['1. 现金']]),
    '表样_231'
  );
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** 将示例 Excel 的第一个 Sheet 重命名为含版本的形式，用于兼容新规则 */
function renameSampleSheet(buffer, newName) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const oldName = wb.SheetNames[0];
  wb.SheetNames[0] = newName;
  wb.Sheets[newName] = wb.Sheets[oldName];
  delete wb.Sheets[oldName];
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${getApiToken()}`, ...extra };
}

const IMPORT_1104 = { moduleCode: '1104' };
const IMPORT_NR = { moduleCode: 'IMAS' };

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

  it('trimTrailingEmptyCols 裁掉右侧空列', () => {
    const matrix = [
      ['标题', 'A', 'B', '', '', ''],
      ['1. 现金', '100', '', '', '', ''],
    ];
    const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    const result = trimTrailingEmptyCols(matrix, merges);

    assert.equal(result.colCount, 3);
    assert.equal(result.matrix[0].length, 3);
    assert.equal(findLastContentCol(matrix, merges), 2);
    assert.deepEqual(result.matrix[0], ['标题', 'A', 'B']);
  });

  it('trimTrailingEmptyCols 保留 merge 向右延伸的有效列', () => {
    const matrix = [
      ['标题', '', '', ''],
      ['', '', '', ''],
    ];
    const merges = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 2 } }];
    const result = trimTrailingEmptyCols(matrix, merges);

    assert.equal(result.colCount, 3);
    assert.equal(result.merges[0].e.c, 2);
  });

  it('trimMatrixPadding 同时裁掉末尾空行与右侧空列', () => {
    const matrix = [
      ['G01表', 'A', 'B', '', ''],
      ['1. 现金', '100', '', '', ''],
      ['', '', '', '', ''],
    ];
    const result = trimMatrixPadding(matrix, []);

    assert.equal(result.rowCount, 2);
    assert.equal(result.colCount, 3);
  });

  it('sheetToMatrix 读取 Excel 原生列宽与行高', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['标题', 'A列'],
      ['行1', '内容'],
    ]);
    ws['!cols'] = [{ wch: 20 }, { wch: 30 }];
    ws['!rows'] = [{ hpt: 20 }, { hpt: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'G0100_231');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = parseFormTemplate(buffer, { fileName: 'G0100-logic_231.xls', ...IMPORT_1104 });

    assert.equal(parsed.colWidths.length, 2);
    assert.equal(parsed.rowHeights.length, 2);
    assert.ok(parsed.colWidths[0] > 0);
    assert.ok(parsed.colWidths[1] > parsed.colWidths[0]);
    assert.ok(parsed.rowHeights[0] > 0);
    assert.ok(parsed.rowHeights[1] > 0);
    const layout = parsed.layout;
    assert.deepEqual(layout.colWidths, parsed.colWidths);
    assert.deepEqual(layout.rowHeights, parsed.rowHeights);
  });

  it('parseFormTemplate G0100 元数据与 merges', () => {
    const buffer = renameSampleSheet(readSample('G0100-logic_231.xls'), 'G0100_231');
    const parsed = parseFormTemplate(buffer, { fileName: 'G0100-logic_231.xls' });

    assert.equal(parsed.reportCode, 'G0100');
    assert.equal(parsed.versionLabel, '231');
    assert.equal(parsed.reportTitle, 'G01资产负债项目统计表');
    assert.equal(parsed.sheetName, 'G0100_231');
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
    const buffer = renameSampleSheet(readSample('G0200-logic_241.xls'), 'G0200_241');
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

  it('isFormTemplateReportCode 仅识别含「_」的 Sheet 名', () => {
    assert.equal(isFormTemplateReportCode('G0100'), false);
    assert.equal(isFormTemplateReportCode('G0100_'), true);
    assert.equal(isFormTemplateReportCode('G0100_231'), true);
    assert.equal(isFormTemplateReportCode('G0100资产负债'), false);
    assert.equal(isFormTemplateReportCode('G4A00X2_241'), true);
    assert.equal(isFormTemplateReportCode('S2400_201'), true);
    assert.equal(isFormTemplateReportCode('NR0100'), false);
    assert.equal(isFormTemplateReportCode('NR0100_'), true);
    assert.equal(isFormTemplateReportCode('NR0100_231'), true);
    assert.equal(isFormTemplateReportCode('NR0100非利率衍生'), false);
    assert.equal(isFormTemplateReportCode('ABC01_100'), true);
    assert.equal(isFormTemplateReportCode('说明'), false);
    assert.equal(isFormTemplateReportCode('说明_231'), false);
    assert.equal(isFormTemplateReportCode('目录'), false);
    assert.equal(isFormTemplateReportCode('1G0100'), false);
  });

  it('parseFormTemplateSheetMeta 解析最后一个「_」后的版本', () => {
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
    assert.equal(parseFormTemplateSheetMeta('G4400X2'), null);
    assert.equal(parseFormTemplateSheetMeta('G1700-221（非最新）'), null);
    assert.deepEqual(parseFormTemplateSheetMeta('S2400_201'), {
      reportCode: 'S2400',
      versionLabel: '201',
    });
    assert.deepEqual(parseFormTemplateSheetMeta('NR0100_231'), {
      reportCode: 'NR0100',
      versionLabel: '231',
    });
    assert.deepEqual(parseFormTemplateSheetMeta('NR0100_'), {
      reportCode: 'NR0100',
      versionLabel: FORM_TEMPLATE_LATEST_VERSION,
    });
    assert.equal(parseFormTemplateSheetMeta('NR0200'), null);
    assert.equal(resolveFormTemplateVersionLabel(parseFormTemplateSheetMeta('G4400X2'), null), FORM_TEMPLATE_LATEST_VERSION);
    assert.equal(
      resolveFormTemplateVersionLabel(parseFormTemplateSheetMeta('NR0200'), null),
      FORM_TEMPLATE_LATEST_VERSION
    );
    assert.equal(
      resolveFormTemplateVersionLabel(parseFormTemplateSheetMeta('G0100_'), null),
      FORM_TEMPLATE_LATEST_VERSION
    );
    assert.equal(parseFileNameMeta('1104汇总总表-整合版-20260428.xlsx'), null);
  });

  it('importFormTemplate 未选模块时报错', () => {
    const buffer = renameSampleSheet(readSample('G0100-logic_231.xls'), 'G0100_231');
    assert.throws(
      () => importFormTemplate(buffer, { fileName: 'G0100-logic_231.xls' }),
      /请选择模块/
    );
  });

  it('importFormTemplate 同版本再次导入会覆盖', () => {
    const buffer = renameSampleSheet(readSample('G0100-logic_231.xls'), 'G0100_231');
    const first = importFormTemplate(buffer, { fileName: 'G0100-logic_231.xls', ...IMPORT_1104 });
    assert.ok(first.id > 0);
    assert.equal(first.importAction, 'created');
    assert.equal(first.moduleCode, '1104');

    const g0100Items = listFormTemplates().filter(
      (x) => x.reportCode === 'G0100' && x.versionLabel === '231'
    );
    assert.equal(g0100Items.length, 1);
    assert.equal(g0100Items[0].moduleCode, '1104');

    const second = importFormTemplate(buffer, { fileName: 'G0100-logic_231.xls', ...IMPORT_1104 });
    assert.equal(second.importAction, 'replaced');
    assert.equal(
      listFormTemplates().filter((x) => x.reportCode === 'G0100' && x.versionLabel === '231').length,
      1
    );
    assert.notEqual(second.id, first.id);

    const detail = getFormTemplate(second.id);
    assert.ok(Array.isArray(detail.matrix));
    assert.equal(detail.merges.length, 8);
    assert.ok(detail.layout?.kinds?.length === detail.rowCount);
    assert.ok(Array.isArray(detail.colWidths));
    assert.ok(detail.colWidths.length === detail.colCount || detail.colWidths.length === 0);
    assert.ok(Array.isArray(detail.rowHeights));
    assert.ok(detail.rowHeights.length === detail.rowCount || detail.rowHeights.length === 0);
    assert.ok(countCellsForTemplate(second.id) > 0);
    assert.equal(getFormTemplate(first.id), null);
  });

  it('parseFormTemplateWorkbook 多 Sheet 按表号导入', () => {
    const buffer = buildMultiSheetWorkbook();
    const parsed = parseFormTemplateWorkbook(buffer, { fileName: 'logic_888.xlsx' });

    assert.equal(parsed.sheets.length, 2);
    assert.deepEqual(
      parsed.sheets.map((s) => s.reportCode).sort(),
      ['G0100', 'G0200']
    );
    assert.equal(parsed.sheets[0].versionLabel, FORM_TEMPLATE_LATEST_VERSION);
    assert.equal(parsed.sheets[1].versionLabel, FORM_TEMPLATE_LATEST_VERSION);
    assert.equal(parsed.skipped.length, 0);
  });

  it('parseFormTemplateWorkbook 多 Sheet 含 NR 表一并导入', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['G01表'], ['1. 现金']]),
      'G0100_231'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['NR表'], ['1. 项目']]),
      'NR0100_231'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['说明']]), '说明');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = parseFormTemplateWorkbook(buffer, { fileName: 'logic_231.xlsx' });

    assert.equal(parsed.sheets.length, 2);
    assert.deepEqual(
      parsed.sheets.map((s) => s.reportCode).sort(),
      ['G0100', 'NR0100']
    );
    assert.ok(parsed.sheets.every((s) => s.versionLabel === '231'));
  });

  it('parseFormTemplateWorkbook 字母开头 Sheet 可导入', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['自定义表'], ['1. 项目']]),
      'ABC01_100'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['说明']]), '说明页');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = parseFormTemplateWorkbook(buffer, { fileName: 'custom.xlsx', ...IMPORT_1104 });
    assert.equal(parsed.sheets.length, 1);
    assert.equal(parsed.sheets[0].reportCode, 'ABC01');
    assert.equal(parsed.sheets[0].versionLabel, '100');
  });

  it('importFormTemplate 多 Sheet 一次入库', () => {
    const buffer = buildMultiSheetWorkbook();
    const result = importFormTemplate(buffer, { fileName: 'logic_888.xlsx', ...IMPORT_1104 });

    assert.equal(result.sheetCount, 2);
    assert.equal(result.imported, 2);
    assert.equal(result.items.length, 2);
    assert.ok(
      listFormTemplates().some(
        (x) => x.reportCode === 'G0100' && x.versionLabel === FORM_TEMPLATE_LATEST_VERSION
      )
    );
    assert.ok(
      listFormTemplates().some(
        (x) => x.reportCode === 'G0200' && x.versionLabel === FORM_TEMPLATE_LATEST_VERSION
      )
    );

    const second = importFormTemplate(buffer, { fileName: 'logic_888.xlsx', ...IMPORT_1104 });
    assert.equal(second.imported, 2);
    assert.equal(second.replacedCount, 2);
    assert.equal(second.createdCount, 0);
    assert.equal(
      listFormTemplates().filter(
        (x) =>
          (x.reportCode === 'G0100' || x.reportCode === 'G0200') &&
          x.versionLabel === FORM_TEMPLATE_LATEST_VERSION
      ).length,
      2
    );
  });

  it('多 Sheet：Sheet 名带版本仍全部导入', () => {
    const buffer = buildMultiSheetWorkbookWithVersionNames();
    const parsed = parseFormTemplateWorkbook(buffer, { fileName: 'logic_999.xlsx' });
    assert.equal(parsed.sheets.length, 2);
    assert.deepEqual(
      parsed.sheets.map((s) => s.reportCode).sort(),
      ['G0300', 'G0400']
    );
    assert.deepEqual(
      parsed.sheets.map((s) => s.versionLabel).sort(),
      ['999', '999']
    );

    const result = importFormTemplate(buffer, { fileName: 'logic_999.xlsx', ...IMPORT_1104 });
    assert.equal(result.imported, 2);
  });

  it('多 Sheet：文件名是单表格式时仍解析全部表号 Sheet，空版本默认 LASTEST', () => {
    const buffer = buildMultiSheetWorkbook();
    const parsed = parseFormTemplateWorkbook(buffer, { fileName: 'G0100-logic_777.xlsx' });
    assert.equal(parsed.sheets.length, 2, '不应因文件名只导 G0100');
    assert.deepEqual(
      parsed.sheets.map((s) => s.reportCode).sort(),
      ['G0100', 'G0200']
    );
    const byCode = Object.fromEntries(parsed.sheets.map((s) => [s.reportCode, s.versionLabel]));
    assert.equal(byCode.G0100, FORM_TEMPLATE_LATEST_VERSION);
    assert.equal(byCode.G0200, FORM_TEMPLATE_LATEST_VERSION);
  });

  it('Sheet 名以中文开头且文件名含表号时可导入', () => {
    const buffer = buildChineseSheetWorkbook();
    const parsed = parseFormTemplateWorkbook(buffer, { fileName: 'G0100-logic_231.xlsx' });
    assert.equal(parsed.sheets.length, 1);
    assert.equal(parsed.sheets[0].reportCode, 'G0100');
    assert.equal(parsed.sheets[0].versionLabel, '231');
  });

  it('NR 表「_」后版本为空时导入为 LASTEST 且再次导入覆盖', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['NR表 v1'], ['1. 项目']]),
      'NR0100_'
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const first = importFormTemplate(buffer, { fileName: 'nr.xlsx', ...IMPORT_NR });
    assert.equal(first.reportCode, 'NR0100');
    assert.equal(first.versionLabel, FORM_TEMPLATE_LATEST_VERSION);
    assert.equal(first.moduleCode, 'IMAS');
    assert.equal(first.importAction, 'created');

    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb2,
      XLSX.utils.aoa_to_sheet([['NR表 v2'], ['2. 更新']]),
      'NR0100_'
    );
    const buffer2 = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' });
    const second = importFormTemplate(buffer2, { fileName: 'nr.xlsx', ...IMPORT_NR });
    assert.equal(second.importAction, 'replaced');
    assert.equal(second.versionLabel, FORM_TEMPLATE_LATEST_VERSION);

    const items = listFormTemplates().filter((x) => x.reportCode === 'NR0100');
    assert.equal(items.length, 1);
    assert.equal(getFormTemplate(items[0].id).matrix[0][0], 'NR表 v2');
  });

  it('POST /api/form-template/import 须传 moduleCode', async () => {
    const buffer = renameSampleSheet(readSample('G0200-logic_241.xls'), 'G0200_241');
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

    assert.equal(res.statusCode, 400);
    assert.match(res.json().message, /模块/);
  });

  it('POST /api/form-template/import', async () => {
    const buffer = renameSampleSheet(readSample('G0200-logic_241.xls'), 'G0200_241');
    const boundary = '----formtest';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="moduleCode"\r\n\r\n1104\r\n`
      ),
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
    assert.equal(json.moduleCode, '1104');
    assert.equal(json.rowCount, 104);
  });

  it('GET /api/dataset/modules 含 IMAS 主类', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dataset/modules',
      headers: authHeaders(),
    });
    assert.equal(res.statusCode, 200);
    const { items } = res.json();
    assert.ok(items.some((m) => m.code === 'IMAS'));
    assert.ok(items.some((m) => m.code === '1104'));
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
    assert.ok(items.every((item) => item.subtypeCode));

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

  it('GET /api/form-templates 可按 subtypeCode 筛选', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/form-templates?subtypeCode=1104_FORM_TEMPLATE',
      headers: authHeaders(),
    });
    assert.equal(listRes.statusCode, 200);
    const { items } = listRes.json();
    assert.ok(items.length >= 1);
    assert.ok(items.every((item) => item.subtypeCode === '1104_FORM_TEMPLATE'));
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
