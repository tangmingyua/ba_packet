/**
 * 1104 表样 Excel 导入：保留矩阵结构与合并单元格，剔除逻辑公式
 */
import crypto from 'crypto';
import path from 'path';
import XLSX from 'xlsx';
import { queryAll, queryOne, run, saveDb } from '../db/database.js';
import { matchFormTemplateFileName, normalizeFormTemplateModuleCode } from '../config/form-template-catalog.js';
import { replaceCellsForTemplate } from './form-template-cells.js';
import { buildFormTemplateLayout, parseFormTemplateLayoutJson } from './form-template-layout.js';

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

/** Sheet 名以字母开头即可作为表样 Sheet */
const FORM_TEMPLATE_SHEET_LETTER_START_RE = /^[A-Za-z]/;
/** 表号段：字母开头 + 字母数字，如 G0100、S2400、NR0100 */
const FORM_TEMPLATE_REPORT_CODE_RE = '([A-Za-z][A-Za-z0-9]*)';

/**
 * 从 Sheet 名解析表号与版本
 * 例：G0100_231、G0101a_231、NR0100_231、ABC01_100
 * @returns {null | { reportCode: string, versionLabel: string | null }}
 */
export function parseFormTemplateSheetMeta(sheetName) {
  let t = String(sheetName || '').trim();
  if (!FORM_TEMPLATE_SHEET_LETTER_START_RE.test(t)) return null;

  t = t.replace(/（[^）]*）$/g, '').trim();

  const dash = t.match(new RegExp(`^${FORM_TEMPLATE_REPORT_CODE_RE}-(\\d+)$`, 'i'));
  if (dash) {
    return { reportCode: dash[1].toUpperCase(), versionLabel: dash[2] };
  }

  const under = t.match(new RegExp(`^${FORM_TEMPLATE_REPORT_CODE_RE}_(\\d+)$`, 'i'));
  if (under) {
    return { reportCode: under[1].toUpperCase(), versionLabel: under[2] };
  }

  const codeOnly = t.match(new RegExp(`^${FORM_TEMPLATE_REPORT_CODE_RE}$`, 'i'));
  if (codeOnly) {
    return { reportCode: codeOnly[1].toUpperCase(), versionLabel: null };
  }

  const legacyPrefix = t.match(new RegExp(`^${FORM_TEMPLATE_REPORT_CODE_RE}`, 'i'));
  if (legacyPrefix) {
    return { reportCode: legacyPrefix[1].toUpperCase(), versionLabel: null };
  }

  return null;
}

/** 从 Sheet 名取表号（完整代号，如 G0101a、G4A00X2） */
export function parseFormTemplateReportCodeFromSheetName(name) {
  return parseFormTemplateSheetMeta(name)?.reportCode || null;
}

/** Sheet 名是否为表样 Sheet（字母开头且可解析表号） */
export function isFormTemplateReportCode(name) {
  return Boolean(parseFormTemplateSheetMeta(name));
}

function resolveImportSheetNames(workbook, fileMeta) {
  const templateSheets = workbook.SheetNames.filter((n) => isFormTemplateReportCode(n));

  if (templateSheets.length > 0) {
    return templateSheets;
  }

  if (fileMeta?.reportCode) {
    const matched = workbook.SheetNames.find((n) => {
      const meta = parseFormTemplateSheetMeta(n);
      return (
        meta?.reportCode === fileMeta.reportCode ||
        String(n).trim().toUpperCase() === fileMeta.reportCode
      );
    });
    if (matched) return [matched];
  }

  return [];
}

function normalizeCellValue(value) {
  if (isLogicCell(value)) return '';
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return cellToString(value);
}

/**
 * 将 sheet 转为从 (0,0) 起的完整矩阵与相对 merges
 */
export function sheetToMatrix(sheet) {
  const ref = sheet['!ref'];
  if (!ref) {
    return { matrix: [], merges: [], rowCount: 0, colCount: 0 };
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

  return { matrix, merges, rowCount, colCount };
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
export function trimTrailingEmptyRows(matrix, merges = []) {
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

  return {
    matrix: trimmedMatrix,
    merges: trimmedMerges,
    rowCount: trimmedMatrix.length,
    colCount: trimmedMatrix[0]?.length || 0,
  };
}

/**
 * 裁掉矩阵右侧连续空列（保留中间空列）
 */
export function trimTrailingEmptyCols(matrix, merges = []) {
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

  return {
    matrix: trimmedMatrix,
    merges: trimmedMerges,
    rowCount: trimmedMatrix.length,
    colCount: lastCol + 1,
  };
}

/** 裁掉末尾空行与右侧空列 */
export function trimMatrixPadding(matrix, merges = []) {
  const rowTrimmed = trimTrailingEmptyRows(matrix, merges);
  return trimTrailingEmptyCols(rowTrimmed.matrix, rowTrimmed.merges);
}

/**
 * 解析单个 Sheet 为表样（不写入库）
 */
export function parseFormTemplateFromSheet(sheet, options = {}) {
  const sheetName = options.sheetName || 'Sheet1';
  const { matrix: rawMatrix, merges } = sheetToMatrix(sheet);
  const cleaned = cleanMatrix(rawMatrix);
  const {
    matrix,
    merges: trimmedMerges,
    rowCount,
    colCount,
  } = trimMatrixPadding(cleaned, merges);
  const reportTitle = cellToString(matrix[0]?.[0]) || sheetName;
  const sheetMeta = parseFormTemplateSheetMeta(sheetName);
  const reportCode = (options.reportCode || sheetMeta?.reportCode || sheetName).toUpperCase();
  const versionLabel =
    options.versionLabel !== undefined
      ? options.versionLabel
      : resolveFormTemplateVersionLabel(sheetMeta, options.fileMeta);

  const layout = buildFormTemplateLayout(matrix, trimmedMerges);

  return {
    reportCode,
    reportTitle,
    versionLabel,
    sheetName,
    fileName: options.fileName || '',
    fileNameMatched: Boolean(options.fileNameMatched),
    module: options.moduleCode || options.module || '1104',
    rowCount,
    colCount,
    matrix,
    merges: trimmedMerges,
    layout,
  };
}

/**
 * 解析工作簿中所有可导入 Sheet
 * @param {Buffer} buffer
 * @param {object} [options]
 * @param {string} [options.fileName]
 */
export function parseFormTemplateWorkbook(buffer, options = {}) {
  const fileName = options.fileName || 'upload.xls';
  const moduleCode = normalizeFormTemplateModuleCode(options.moduleCode || options.module);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  if (!workbook.SheetNames.length) {
    throw new Error('工作簿无 Sheet');
  }

  const fileMeta = parseFileNameMeta(fileName) || { reportCode: null, versionLabel: '' };
  const nameMatch = matchFormTemplateFileName(fileName);
  const sheetNames = resolveImportSheetNames(workbook, fileMeta);

  const sheets = [];
  const skipped = [];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      skipped.push({ sheetName, reason: 'Sheet 不存在' });
      continue;
    }

    const sheetMeta = parseFormTemplateSheetMeta(sheetName);
    const parsed = parseFormTemplateFromSheet(sheet, {
      sheetName,
      fileName,
      reportCode: sheetMeta?.reportCode || fileMeta.reportCode || null,
      fileMeta,
      fileNameMatched: nameMatch.matched,
      module: moduleCode,
    });

    if (parsed.rowCount === 0 && parsed.colCount === 0) {
      skipped.push({ sheetName, reason: '空 Sheet' });
      continue;
    }

    sheets.push(parsed);
  }

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
export function parseFormTemplate(buffer, options = {}) {
  return parseFormTemplateWorkbook(buffer, options).sheets[0];
}

function mapFormTemplateRow(row) {
  return {
    id: Number(row.id),
    reportCode: row.report_code,
    reportTitle: row.report_title || '',
    versionLabel: row.version_label,
    moduleCode: row.module_code || '1104',
    sheetName: row.sheet_name,
    sourceFileName: row.source_file_name || '',
    fileHash: row.file_hash || '',
    rowCount: Number(row.row_count),
    colCount: Number(row.col_count),
    importedAt: row.imported_at,
  };
}

export function listFormTemplates() {
  const rows = queryAll(
    `SELECT id, report_code, report_title, version_label, module_code, sheet_name,
            source_file_name, file_hash, row_count, col_count, imported_at
     FROM form_templates
     ORDER BY report_code, version_label`
  );
  return rows.map(mapFormTemplateRow);
}

export function getFormTemplate(id) {
  const row = queryOne('SELECT * FROM form_templates WHERE id = ?', [Number(id)]);
  if (!row) return null;

  const matrix = JSON.parse(row.matrix_json || '[]');
  const merges = JSON.parse(row.merges_json || '[]');

  return {
    ...mapFormTemplateRow(row),
    matrix,
    merges,
    layout: parseFormTemplateLayoutJson(row.layout_json, matrix, merges),
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

function importParsedFormTemplate(parsed, fileHash) {
  const existing = findExistingFormTemplate(parsed.reportCode, parsed.versionLabel);
  const importAction = existing ? 'replaced' : 'created';
  if (existing) {
    removeFormTemplateRecord(existing.id);
  }

  const matrixJson = JSON.stringify(parsed.matrix);
  const mergesJson = JSON.stringify(parsed.merges);
  const layoutJson = JSON.stringify(parsed.layout || buildFormTemplateLayout(parsed.matrix, parsed.merges));

  run(
    `INSERT INTO form_templates (
       report_code, report_title, version_label, module_code, sheet_name, source_file_name, file_hash,
       matrix_json, merges_json, layout_json, row_count, col_count
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parsed.reportCode,
      parsed.reportTitle,
      parsed.versionLabel,
      parsed.module || '1104',
      parsed.sheetName,
      parsed.fileName,
      fileHash,
      matrixJson,
      mergesJson,
      layoutJson,
      parsed.rowCount,
      parsed.colCount,
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
export function importFormTemplate(buffer, options = {}) {
  const moduleCode = normalizeFormTemplateModuleCode(options.moduleCode || options.module);
  if (!moduleCode) {
    throw new Error('请选择模块');
  }
  const fileHash = hashBuffer(buffer);
  const { sheets, skipped } = parseFormTemplateWorkbook(buffer, { ...options, moduleCode });

  const items = sheets.map((parsed) => importParsedFormTemplate(parsed, fileHash));
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
