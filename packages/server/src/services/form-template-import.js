/**
 * 1104 表样 Excel 导入：保留矩阵结构与合并单元格，剔除逻辑公式
 */
import crypto from 'crypto';
import path from 'path';
import XLSX from 'xlsx';
import {
  isXlsxBuffer,
  loadExcelJsWorkbook,
  readExcelJsSheetRowHeightsPx,
  readExcelJsSheetColWidthsPx,
} from './form-template-excel-row-heights.js';
import { queryAll, queryOne, run, saveDb } from '../db/database.js';
import { matchFormTemplateFileName, normalizeFormTemplateModuleCode, usesWholeSheetNameFormTemplateRules } from '../config/form-template-catalog.js';
import { resolveSubtypeCode } from '../config/system-subtypes.js';
import { resolveImportSubtypeCode, ensureSubtypeVersionForImport } from './dataset-config.js';
import { replaceCellsForTemplate } from './form-template-cells.js';
import {
  buildFormTemplateLayout,
  buildMergeRenderMap,
  parseFormTemplateLayoutJson,
} from './form-template-layout.js';
import { cellText } from './form-template-search-scope.js';

/** Sheet/文件名均无「_数字」版本时使用的默认版本（表示最新，再次导入同表号会覆盖） */
export const FORM_TEMPLATE_LATEST_VERSION = 'LASTEST';

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function cellToString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** 判定是否为逻辑公式单元格（导入时清空） */
export function isLogicCell(value) {
  const s = cellToString(value);
  if (!s) return false;
  if (s.includes('加总(')) return true;
  if (s.includes('数据来源=')) return true;
  if (s.includes('|') && s.length > 40) return true;
  return false;
}

/** 从文件名解析表号与版本：G0100-logic_231.xls / logic_231.xlsx / 1104汇总总表-整合版-20260428.xlsx */
export function parseFileNameMeta(fileName) {
  const base = path.basename(String(fileName || ''), path.extname(String(fileName || '')));
  const single = base.match(/^(G\d+)-logic_(\d+)/i);
  if (single) {
    return {
      reportCode: single[1].toUpperCase(),
      versionLabel: single[2],
    };
  }
  const multi = base.match(/logic_(\d+)/i);
  if (multi) {
    return {
      reportCode: null,
      versionLabel: multi[1],
    };
  }
  return null;
}

/** Sheet/文件名均无「_数字」版本时用 LASTEST；单表文件名 logic_231 且表号一致时仍沿用文件名版本 */
export function resolveFormTemplateVersionLabel(sheetMeta, fileMeta) {
  if (sheetMeta?.versionLabel) return sheetMeta.versionLabel;
  if (
    fileMeta?.reportCode &&
    fileMeta?.versionLabel &&
    sheetMeta?.reportCode === fileMeta.reportCode
  ) {
    return fileMeta.versionLabel;
  }
  return FORM_TEMPLATE_LATEST_VERSION;
}

/**
 * 表样显示名称：Sheet 名中最后一个「_」前的全部字符串；无下划线时回退到已存储标题或 Sheet 名
 * 一表通特殊处理：Sheet 名即为表名，不分割
 */
export function resolveFormTemplateReportTitle(sheetName, reportTitle, moduleCode) {
  if (usesWholeSheetNameFormTemplateRules(moduleCode)) {
    return String(sheetName || '').trim();
  }
  const t = String(sheetName || '').trim();
  if (t.includes('_')) {
    return t.slice(0, t.lastIndexOf('_')).trim();
  }
  return String(reportTitle || '').trim() || t;
}

/** 表号段：字母开头 + 字母数字，如 G0100、S2400、NR0100 */
const FORM_TEMPLATE_REPORT_CODE_RE = '([A-Za-z][A-Za-z0-9]*)';

/** 明显不是表样 Sheet 的名称（说明页、目录等） */
const EXCLUDED_TEMPLATE_SHEET_NAMES = new Set(['说明', '目录', '封面', '目录页', '说明页', '备注']);
const EXCLUDED_TEMPLATE_SHEET_RE = /^Sheet\d+$/i;

function isExcludedTemplateSheet(name) {
  const t = String(name || '').trim();
  return EXCLUDED_TEMPLATE_SHEET_NAMES.has(t) || EXCLUDED_TEMPLATE_SHEET_RE.test(t);
}

function parseReportCodeFromCodePart(codePart) {
  let t = String(codePart || '').trim();
  if (!t) return null;
  t = t.replace(/（[^）]*）$/g, '').trim();

  const codeOnly = t.match(new RegExp(`^${FORM_TEMPLATE_REPORT_CODE_RE}$`, 'i'));
  if (codeOnly) {
    return codeOnly[1].toUpperCase();
  }

  const legacyPrefix = t.match(new RegExp(`^${FORM_TEMPLATE_REPORT_CODE_RE}`, 'i'));
  if (legacyPrefix) {
    return legacyPrefix[1].toUpperCase();
  }

  return null;
}

/**
 * 从 Sheet 名解析表号与版本
 * 规则：Sheet 名必须含「_」，最后一个「_」后的字符串为版本；为空时默认 LASTEST
 * 例：G0100_231、G0101a_231、NR0100_、ABC01_100
 * 若「_」前的代号部分无法解析表号，可传入 fileMeta 从文件名回退表号
 * @returns {null | { reportCode: string, versionLabel: string }}
 */
export function parseFormTemplateSheetMeta(sheetName, fileMeta = null) {
  const t = String(sheetName || '').trim();
  if (!t || isExcludedTemplateSheet(t)) return null;

  const isWholeSheetNameModule = usesWholeSheetNameFormTemplateRules(fileMeta?.moduleCode);

  // 一表通 / PISA / EAST 等：所有非排除 Sheet 都导入；report_code 默认用完整 Sheet 名
  if (isWholeSheetNameModule) {
    return {
      reportCode: t,
      versionLabel: fileMeta?.versionLabel || FORM_TEMPLATE_LATEST_VERSION,
    };
  }

  if (!t.includes('_')) return null;

  const lastUnderscore = t.lastIndexOf('_');
  const codePart = t.slice(0, lastUnderscore).trim();
  const versionPart = t.slice(lastUnderscore + 1).trim();

  if (!codePart || isExcludedTemplateSheet(codePart)) return null;

  let reportCode = parseReportCodeFromCodePart(codePart);
  if (!reportCode && fileMeta?.reportCode) {
    reportCode = fileMeta.reportCode;
  }
  if (!reportCode) return null;

  const versionLabel = versionPart || FORM_TEMPLATE_LATEST_VERSION;

  return { reportCode, versionLabel };
}

/** 从 Sheet 名取表号（完整代号，如 G0101a、G4A00X2） */
export function parseFormTemplateReportCodeFromSheetName(name, fileMeta) {
  return parseFormTemplateSheetMeta(name, fileMeta)?.reportCode || null;
}

/** Sheet 名是否为表样 Sheet（必须含「_」且可解析出表号，或为排除项） */
export function isFormTemplateReportCode(name, fileMeta = null) {
  return Boolean(parseFormTemplateSheetMeta(name, fileMeta));
}

function resolveImportSheetNames(workbook, fileMeta) {
  return workbook.SheetNames.filter((n) => Boolean(parseFormTemplateSheetMeta(n, fileMeta)));
}

function normalizeCellValue(value) {
  if (isLogicCell(value)) return '';
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return cellToString(value);
}

function colWidthToPixels(col) {
  if (!col) return 0;
  if (col.wpx && col.wpx > 0) return Math.round(col.wpx);
  if (col.wch && col.wch > 0) return Math.round(col.wch * 7.5 + 8);
  return 0;
}

function rowHeightToPixels(row) {
  if (!row) return 0;
  if (row.hpx && row.hpx > 0) return Math.round(row.hpx);
  if (row.hpt && row.hpt > 0) return Math.round(row.hpt * 1.333);
  return 0;
}

function readSheetDimensions(
  sheet,
  colCount,
  rowCount,
  rangeStartRow = 0,
  rangeStartCol = 0,
  excelRowHeights = null,
  excelColWidths = null
) {
  const cols = sheet['!cols'] || [];
  const rows = sheet['!rows'] || [];
  const colWidths = Array.from({ length: colCount }, (_, i) => {
    const absC = rangeStartCol + i;
    const w = colWidthToPixels(cols[absC]);
    if (w > 0) return w;
    const fromExcel = excelColWidths?.[i];
    if (fromExcel > 0) return fromExcel;
    return 72; // 默认列宽
  });
  const rowHeights = Array.from({ length: rowCount }, (_, i) => {
    const absR = rangeStartRow + i;
    const h = rowHeightToPixels(rows[absR]);
    if (h > 0) return h;
    const fromExcel = excelRowHeights?.[i];
    if (fromExcel > 0) return fromExcel;
    return 0;
  });
  return { colWidths, rowHeights };
}

/**
 * 将 sheet 转为从 (0,0) 起的完整矩阵、相对 merges、原生列宽/行高
 */
export function sheetToMatrix(sheet, options = {}) {
  const ref = sheet['!ref'];
  if (!ref) {
    return { matrix: [], merges: [], colWidths: [], rowHeights: [], rowCount: 0, colCount: 0 };
  }

  const range = XLSX.utils.decode_range(ref);
  const rowCount = range.e.r - range.s.r + 1;
  const colCount = range.e.c - range.s.c + 1;
  const matrix = [];

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      row.push(cell == null ? null : cell.v);
    }
    matrix.push(row);
  }

  const merges = (sheet['!merges'] || []).map((m) => ({
    s: { r: m.s.r - range.s.r, c: m.s.c - range.s.c },
    e: { r: m.e.r - range.s.r, c: m.e.c - range.s.c },
  }));

  const { colWidths, rowHeights } = readSheetDimensions(
    sheet,
    colCount,
    rowCount,
    range.s.r,
    range.s.c,
    options.excelRowHeights,
    options.excelColWidths
  );

  return { matrix, merges, colWidths, rowHeights, rowCount, colCount };
}

export function cleanMatrix(matrix) {
  return matrix.map((row) => (row || []).map((cell) => normalizeCellValue(cell)));
}

function mergeHasContent(matrix, merge) {
  for (let r = merge.s.r; r <= merge.e.r; r += 1) {
    for (let c = merge.s.c; c <= merge.e.c; c += 1) {
      if (cellToString(matrix[r]?.[c]) !== '') return true;
    }
  }
  return false;
}

/** 找到矩阵中有内容（含有效 merge 覆盖）的最后一行，0-based */
export function findLastContentRow(matrix, merges = []) {
  let last = -1;
  for (let r = 0; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    if (line.some((cell) => cellToString(cell) !== '')) {
      last = Math.max(last, r);
    }
  }
  for (const merge of merges) {
    if (mergeHasContent(matrix, merge)) {
      last = Math.max(last, merge.e.r);
    }
  }
  return last;
}

/** 找到矩阵中有内容（含有效 merge 覆盖）的最后一列，0-based */
export function findLastContentCol(matrix, merges = []) {
  let last = -1;
  for (let r = 0; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    for (let c = 0; c < line.length; c += 1) {
      if (cellToString(line[c]) !== '') {
        last = Math.max(last, c);
      }
    }
  }
  for (const merge of merges) {
    if (mergeHasContent(matrix, merge)) {
      last = Math.max(last, merge.e.c);
    }
  }
  return last;
}

/**
 * 裁掉矩阵末尾连续空行（保留中间空行）
 */
export function trimTrailingEmptyRows(matrix, merges = [], dimensions = null) {
  if (!matrix.length) {
    return { matrix: [], merges: [], rowCount: 0, colCount: 0 };
  }

  const lastRow = findLastContentRow(matrix, merges);
  if (lastRow < 0) {
    return { matrix: [], merges: [], rowCount: 0, colCount: matrix[0]?.length || 0 };
  }

  const trimmedMatrix = matrix.slice(0, lastRow + 1);
  const trimmedMerges = merges
    .filter((m) => m.s.r <= lastRow)
    .map((m) => ({
      s: { r: m.s.r, c: m.s.c },
      e: { r: Math.min(m.e.r, lastRow), c: m.e.c },
    }));

  const result = {
    matrix: trimmedMatrix,
    merges: trimmedMerges,
    rowCount: trimmedMatrix.length,
    colCount: trimmedMatrix[0]?.length || 0,
  };

  if (dimensions?.rowHeights?.length) {
    result.rowHeights = dimensions.rowHeights.slice(0, lastRow + 1);
  }
  if (dimensions?.colWidths?.length) {
    result.colWidths = dimensions.colWidths.slice();
  }
  return result;
}

/**
 * 裁掉矩阵右侧连续空列（保留中间空列）
 */
export function trimTrailingEmptyCols(matrix, merges = [], dimensions = null) {
  if (!matrix.length) {
    return { matrix: [], merges: [], rowCount: 0, colCount: 0 };
  }

  const lastCol = findLastContentCol(matrix, merges);
  if (lastCol < 0) {
    return { matrix: [], merges: [], rowCount: matrix.length, colCount: 0 };
  }

  const trimmedMatrix = matrix.map((row) => (row || []).slice(0, lastCol + 1));
  const trimmedMerges = merges
    .filter((m) => m.s.c <= lastCol)
    .map((m) => ({
      s: { r: m.s.r, c: m.s.c },
      e: { r: m.e.r, c: Math.min(m.e.c, lastCol) },
    }));

  const result = {
    matrix: trimmedMatrix,
    merges: trimmedMerges,
    rowCount: trimmedMatrix.length,
    colCount: lastCol + 1,
  };

  if (dimensions?.colWidths?.length) {
    result.colWidths = dimensions.colWidths.slice(0, lastCol + 1);
  }
  if (dimensions?.rowHeights?.length) {
    result.rowHeights = dimensions.rowHeights.slice();
  }
  return result;
}

/** 裁掉末尾空行与右侧空列 */
export function trimMatrixPadding(matrix, merges = [], dimensions = null) {
  const rowTrimmed = trimTrailingEmptyRows(matrix, merges, dimensions);
  return trimTrailingEmptyCols(rowTrimmed.matrix, rowTrimmed.merges, rowTrimmed);
}

/**
 * 解析单个 Sheet 为表样（不写入库）
 */
export function parseFormTemplateFromSheet(sheet, options = {}) {
  const sheetName = options.sheetName || 'Sheet1';
  const { matrix: rawMatrix, merges, colWidths, rowHeights } = sheetToMatrix(sheet, {
    excelRowHeights: options.excelRowHeights,
    excelColWidths: options.excelColWidths,
  });
  const cleaned = cleanMatrix(rawMatrix);
  const {
    matrix,
    merges: trimmedMerges,
    rowCount,
    colCount,
    colWidths: trimmedColWidths,
    rowHeights: trimmedRowHeights,
  } = trimMatrixPadding(cleaned, merges, { colWidths, rowHeights });

  // 先按临时布局得到单元格类型，再估算 xlsx 未提供固定行高的行
  const tempLayout = buildFormTemplateLayout(matrix, trimmedMerges, {
    colWidths: trimmedColWidths,
    rowHeights: [],
  });
  const finalRowHeights = computeAutoRowHeights(
    matrix,
    trimmedMerges,
    trimmedColWidths,
    tempLayout.kinds,
    trimmedRowHeights
  );

  const sheetMeta = parseFormTemplateSheetMeta(sheetName, options.fileMeta);
  const moduleForRules = options.moduleCode || options.module || options.fileMeta?.moduleCode;
  const rawReportCode = options.reportCode || sheetMeta?.reportCode || sheetName;
  const reportCode = usesWholeSheetNameFormTemplateRules(moduleForRules)
    ? String(rawReportCode).trim()
    : String(rawReportCode).toUpperCase();
  const reportTitle = resolveFormTemplateReportTitle(sheetName, '', options.module);
  const versionLabel =
    options.versionLabel !== undefined
      ? options.versionLabel
      : resolveFormTemplateVersionLabel(sheetMeta, options.fileMeta);

  const layout = buildFormTemplateLayout(matrix, trimmedMerges, {
    colWidths: trimmedColWidths,
    rowHeights: finalRowHeights,
  });

  return {
    reportCode,
    reportTitle,
    versionLabel,
    sheetName,
    sheetIndex: options.sheetIndex ?? 0,
    fileName: options.fileName || '',
    fileNameMatched: Boolean(options.fileNameMatched),
    module: options.moduleCode || options.module || '1104',
    rowCount,
    colCount,
    matrix,
    merges: trimmedMerges,
    colWidths: trimmedColWidths,
    rowHeights: finalRowHeights,
    layout,
  };
}

function fontSizeForCellKind(kind) {
  switch (kind) {
    case 'title':
      return 16;
    case 'section':
      return 14;
    case 'header':
      return 12;
    default:
      return 13;
  }
}

function estimateCellLines(text, cellWidth, fontSize) {
  if (!cellWidth || cellWidth <= 0) return 1;
  const charWidth = fontSize * 0.6;
  const charsPerLine = Math.max(1, Math.floor(cellWidth / charWidth));
  let lines = 0;
  for (const seg of String(text).split('\n')) {
    if (seg === '') {
      lines += 1;
    } else {
      lines += Math.max(1, Math.ceil(seg.length / charsPerLine));
    }
  }
  return lines;
}

/**
 * 对 xlsx 未给出固定行高的行，按内容长度、列宽、单元格类型估算 Excel 自动行高。
 * 行高 = 行内最高单元格所需行数 × 字体行高 + 4px padding（2+2）。
 */
function computeAutoRowHeights(matrix, merges, colWidths, kinds, existingHeights) {
  if (!matrix.length) return existingHeights;
  const rowCount = matrix.length;
  const renderMap = buildMergeRenderMap(merges);
  const required = Array.from({ length: rowCount }, () => 0);

  for (let r = 0; r < rowCount; r += 1) {
    const row = matrix[r] || [];
    let rowMax = 0;
    for (let c = 0; c < row.length; c += 1) {
      if (renderMap.covered.has(`${r},${c}`)) continue;
      const text = cellText(row[c]);
      if (!text) continue;
      const span = renderMap.spanAt.get(`${r},${c}`) || { rowspan: 1, colspan: 1 };
      let cellWidth = 0;
      for (let i = 0; i < span.colspan; i += 1) {
        cellWidth += colWidths[c + i] || 0;
      }
      const kind = kinds[r]?.[c] || 'text';
      const fontSize = fontSizeForCellKind(kind);
      const lineHeight = Math.round(fontSize * 1.35);
      const lines = estimateCellLines(text, cellWidth, fontSize);
      const cellHeight = lines * lineHeight + 4;
      if (span.rowspan === 1) {
        rowMax = Math.max(rowMax, cellHeight);
      } else {
        // 跨行合并：把总高度均分到所占行
        rowMax = Math.max(rowMax, cellHeight / span.rowspan);
      }
    }
    required[r] = rowMax;
  }

  // 处理跨行合并单元格：若总需求高度大于估算之和，把差额加到自动行高行
  for (const merge of merges || []) {
    const { r, c } = merge.s;
    const span = {
      rowspan: merge.e.r - merge.s.r + 1,
      colspan: merge.e.c - merge.s.c + 1,
    };
    const text = cellText(matrix[r]?.[c]);
    if (!text) continue;
    let cellWidth = 0;
    for (let i = 0; i < span.colspan; i += 1) {
      cellWidth += colWidths[c + i] || 0;
    }
    const kind = kinds[r]?.[c] || 'text';
    const fontSize = fontSizeForCellKind(kind);
    const lineHeight = Math.round(fontSize * 1.35);
    const cellHeight = estimateCellLines(text, cellWidth, fontSize) * lineHeight + 4;
    const sumRequired = required.slice(r, r + span.rowspan).reduce((a, b) => a + b, 0);
    if (cellHeight > sumRequired) {
      const extra = cellHeight - sumRequired;
      const autoIndexes = [];
      for (let i = 0; i < span.rowspan; i += 1) {
        if (!existingHeights[r + i] || existingHeights[r + i] <= 0) {
          autoIndexes.push(r + i);
        }
      }
      if (autoIndexes.length) {
        const extraPerRow = extra / autoIndexes.length;
        for (const idx of autoIndexes) {
          required[idx] += extraPerRow;
        }
      }
    }
  }

  return existingHeights.map((h, r) => {
    if (h > 0) return h;
    return Math.max(24, Math.round(required[r] || 24));
  });
}

/**
 * 解析工作簿中所有可导入 Sheet
 * @param {Buffer} buffer
 * @param {object} [options]
 * @param {string} [options.fileName]
 */
export async function parseFormTemplateWorkbook(buffer, options = {}) {
  const fileName = options.fileName || 'upload.xls';
  const moduleCode = normalizeFormTemplateModuleCode(options.moduleCode || options.module);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
  if (!workbook.SheetNames.length) {
    throw new Error('工作簿无 Sheet');
  }

  let excelWorkbook = null;
  if (isXlsxBuffer(buffer, fileName)) {
    try {
      excelWorkbook = await loadExcelJsWorkbook(buffer);
    } catch {
      excelWorkbook = null;
    }
  }

  const parsedFileMeta = parseFileNameMeta(fileName) || { reportCode: null, versionLabel: '' };
  const fileMeta = { ...parsedFileMeta, moduleCode };
  const nameMatch = matchFormTemplateFileName(fileName);
  const sheetNames = resolveImportSheetNames(workbook, fileMeta);
  const batchVersionLabel =
    options.versionLabel !== undefined && options.versionLabel !== null
      ? String(options.versionLabel).trim()
      : null;

  const sheets = [];
  const skipped = [];

  sheetNames.forEach((sheetName, sheetIndex) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      skipped.push({ sheetName, reason: 'Sheet 不存在' });
      return;
    }

    let excelRowHeights = null;
    let excelColWidths = null;
    if (excelWorkbook && sheet['!ref']) {
      const range = XLSX.utils.decode_range(sheet['!ref']);
      const rowCount = range.e.r - range.s.r + 1;
      const colCount = range.e.c - range.s.c + 1;
      excelRowHeights = readExcelJsSheetRowHeightsPx(
        excelWorkbook,
        sheetName,
        range.s.r,
        rowCount
      );
      excelColWidths = readExcelJsSheetColWidthsPx(
        excelWorkbook,
        sheetName,
        range.s.c,
        colCount
      );
    }

    const sheetMeta = parseFormTemplateSheetMeta(sheetName, fileMeta);
    const parsed = parseFormTemplateFromSheet(sheet, {
      sheetName,
      sheetIndex,
      fileName,
      reportCode: sheetMeta?.reportCode || fileMeta.reportCode || null,
      fileMeta,
      fileNameMatched: nameMatch.matched,
      module: moduleCode,
      moduleCode,
      versionLabel: batchVersionLabel !== null ? batchVersionLabel : undefined,
      excelRowHeights,
      excelColWidths,
    });

    if (parsed.rowCount === 0 && parsed.colCount === 0) {
      skipped.push({ sheetName, reason: '空 Sheet' });
      return;
    }

    sheets.push(parsed);
  });

  if (!sheets.length) {
    const detail = skipped.map((s) => `${s.sheetName}（${s.reason}）`).join('、');
    throw new Error(detail ? `没有可导入的表样 Sheet：${detail}` : '没有可导入的表样');
  }

  return {
    fileName,
    fileMeta,
    fileNameMatched: nameMatch.matched,
    sheets,
    skipped,
  };
}

/**
 * 解析表样 Excel（不写入库，返回首张表样，兼容旧调用）
 * @param {Buffer} buffer
 * @param {object} [options]
 * @param {string} [options.fileName]
 */
export async function parseFormTemplate(buffer, options = {}) {
  const result = await parseFormTemplateWorkbook(buffer, options);
  return result.sheets[0];
}

function mapFormTemplateRow(row) {
  return {
    id: Number(row.id),
    reportCode: row.report_code,
    reportTitle: resolveFormTemplateReportTitle(row.sheet_name, row.report_title, row.module_code),
    versionLabel: row.version_label,
    moduleCode: row.module_code || '1104',
    sheetIndex: Number(row.sheet_index ?? 0),
    subtypeCode: row.subtype_code || '',
    sheetName: row.sheet_name,
    sourceFileName: row.source_file_name || '',
    fileHash: row.file_hash || '',
    rowCount: Number(row.row_count),
    colCount: Number(row.col_count),
    importedAt: row.imported_at,
  };
}

export function listFormTemplates({ moduleCode, subtypeCode } = {}) {
  const conditions = [];
  const params = [];
  const mod = String(moduleCode ?? '').trim();
  const st = String(subtypeCode ?? '').trim();
  if (mod) {
    conditions.push('module_code = ?');
    params.push(mod);
  }
  if (st) {
    conditions.push('subtype_code = ?');
    params.push(st);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = queryAll(
    `SELECT id, report_code, report_title, version_label, module_code, subtype_code, sheet_name,
            source_file_name, file_hash, row_count, col_count, imported_at, sheet_index
     FROM form_templates
     ${where}
     ORDER BY imported_at, sheet_index`,
    params
  );
  return rows.map(mapFormTemplateRow);
}

export function getFormTemplate(id) {
  const row = queryOne('SELECT * FROM form_templates WHERE id = ?', [Number(id)]);
  if (!row) return null;

  const matrix = JSON.parse(row.matrix_json || '[]');
  const merges = JSON.parse(row.merges_json || '[]');
  const colWidths = JSON.parse(row.col_widths_json || '[]');
  const rowHeights = JSON.parse(row.row_heights_json || '[]');

  return {
    ...mapFormTemplateRow(row),
    matrix,
    merges,
    colWidths,
    rowHeights,
    layout: parseFormTemplateLayoutJson(row.layout_json, matrix, merges, { colWidths, rowHeights }),
  };
}

/** 删除表样（级联删除 form_template_cells） */
function removeFormTemplateRecord(templateId) {
  const id = Number(templateId);
  run('DELETE FROM form_template_cells WHERE template_id = ?', [id]);
  run('DELETE FROM form_templates WHERE id = ?', [id]);
}

export function deleteFormTemplate(id) {
  const templateId = Number(id);
  if (!Number.isFinite(templateId) || templateId <= 0) {
    throw new Error('无效的表样 ID');
  }

  const existing = queryOne(
    'SELECT id, report_code, version_label FROM form_templates WHERE id = ?',
    [templateId]
  );
  if (!existing) throw new Error('表样不存在');

  removeFormTemplateRecord(templateId);
  saveDb();

  return {
    ok: true,
    id: templateId,
    reportCode: existing.report_code,
    versionLabel: existing.version_label,
    message: `已删除表样 ${existing.report_code} / 版本 ${existing.version_label}`,
  };
}

function formatVersionLabel(versionLabel) {
  const v = String(versionLabel ?? '').trim();
  if (!v) return '（无）';
  if (v === FORM_TEMPLATE_LATEST_VERSION) return 'LASTEST';
  return v;
}

function buildImportMessage(items, skipped) {
  if (items.length === 1) {
    return items[0].message;
  }

  const created = items.filter((i) => i.importAction === 'created').length;
  const replaced = items.filter((i) => i.importAction === 'replaced').length;
  const parts = [];
  if (created) parts.push(`新增 ${created} 张`);
  if (replaced) parts.push(`覆盖 ${replaced} 张`);
  let msg = parts.length ? parts.join('，') : `共导入 ${items.length} 张表样`;
  if (skipped.length) msg += `，跳过 ${skipped.length} 个 Sheet`;
  return msg;
}

function findExistingFormTemplate(reportCode, versionLabel) {
  return queryOne(
    `SELECT id, report_code, version_label, report_title
     FROM form_templates
     WHERE report_code = ? AND version_label = ?`,
    [reportCode, versionLabel]
  );
}

function importParsedFormTemplate(parsed, fileHash, subtypeCode) {
  const existing = findExistingFormTemplate(parsed.reportCode, parsed.versionLabel);
  const importAction = existing ? 'replaced' : 'created';
  if (existing) {
    removeFormTemplateRecord(existing.id);
  }

  const matrixJson = JSON.stringify(parsed.matrix);
  const mergesJson = JSON.stringify(parsed.merges);
  const layoutJson = JSON.stringify(parsed.layout || buildFormTemplateLayout(parsed.matrix, parsed.merges));
  const colWidthsJson = JSON.stringify(parsed.colWidths || []);
  const rowHeightsJson = JSON.stringify(parsed.rowHeights || []);
  const moduleCode = parsed.module || '1104';
  const resolvedSubtypeCode = subtypeCode || resolveSubtypeCode('form_template', moduleCode);

  run(
    `INSERT INTO form_templates (
       report_code, report_title, version_label, subtype_code, module_code, sheet_name, source_file_name, file_hash,
       matrix_json, merges_json, layout_json, col_widths_json, row_heights_json, row_count, col_count, sheet_index
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parsed.reportCode,
      parsed.reportTitle,
      parsed.versionLabel,
      resolvedSubtypeCode,
      moduleCode,
      parsed.sheetName,
      parsed.fileName,
      fileHash,
      matrixJson,
      mergesJson,
      layoutJson,
      colWidthsJson,
      rowHeightsJson,
      parsed.rowCount,
      parsed.colCount,
      parsed.sheetIndex ?? 0,
    ]
  );
  const inserted = queryOne('SELECT last_insert_rowid() AS id');
  replaceCellsForTemplate(inserted.id, parsed.matrix);

  const actionLabel = importAction === 'replaced' ? '覆盖' : '新增';

  return {
    ok: true,
    id: Number(inserted.id),
    reportCode: parsed.reportCode,
    reportTitle: parsed.reportTitle,
    versionLabel: parsed.versionLabel,
    moduleCode: parsed.module || '1104',
    sheetName: parsed.sheetName,
    rowCount: parsed.rowCount,
    colCount: parsed.colCount,
    mergeCount: parsed.merges.length,
    fileNameMatched: parsed.fileNameMatched,
    importAction,
    replacedId: existing ? Number(existing.id) : null,
    message: `${actionLabel}：${parsed.reportCode} / 版本 ${formatVersionLabel(parsed.versionLabel)}（${parsed.rowCount}×${parsed.colCount}）`,
  };
}

/**
 * 导入表样并入库（同 report_code + version_label 已存在则覆盖）
 */
export async function importFormTemplate(buffer, options = {}) {
  const moduleCode = normalizeFormTemplateModuleCode(options.moduleCode || options.module);
  if (!moduleCode) {
    throw new Error('请选择模块');
  }
  const subtypeCode = options.subtypeCode
    ? resolveImportSubtypeCode(options.subtypeCode, 'form_template', { moduleCode })
    : resolveSubtypeCode('form_template', moduleCode);
  const importVersion = String(options.versionLabel ?? '').trim();
  if (importVersion) {
    ensureSubtypeVersionForImport(subtypeCode, importVersion);
  }
  const fileHash = hashBuffer(buffer);
  const { sheets, skipped } = await parseFormTemplateWorkbook(buffer, {
    ...options,
    moduleCode,
    versionLabel: importVersion || undefined,
  });

  const items = sheets.map((parsed) => importParsedFormTemplate(parsed, fileHash, subtypeCode));
  saveDb();

  const message = buildImportMessage(items, skipped);
  const createdCount = items.filter((i) => i.importAction === 'created').length;
  const replacedCount = items.filter((i) => i.importAction === 'replaced').length;

  const result = {
    ok: true,
    sheetCount: sheets.length,
    imported: items.length,
    createdCount,
    replacedCount,
    createdItems: items.filter((i) => i.importAction === 'created'),
    replacedItems: items.filter((i) => i.importAction === 'replaced'),
    skipped: skipped.length,
    items,
    skippedSheets: skipped,
    message,
  };

  if (items.length === 1) {
    return { ...result, ...items[0] };
  }
  return result;
}
