/**
 * 使用 ExcelJS 读取 xlsx 行高/列宽（补 SheetJS !rows/!cols 缺失，如 WPS 仅 default* + custom*）
 */
import ExcelJS from 'exceljs';

const XLSX_ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** 磅 → 像素（与 SheetJS pt2px 近似一致） */
export function pointsToPixels(pt) {
  if (pt == null || Number.isNaN(Number(pt)) || Number(pt) <= 0) return 0;
  return Math.round(Number(pt) * 1.333);
}

export function isXlsxBuffer(buffer, fileName = '') {
  const ext = String(fileName || '').toLowerCase();
  if (ext.endsWith('.xlsx') || ext.endsWith('.xlsm')) return true;
  if (!buffer || buffer.length < 4) return false;
  return XLSX_ZIP_MAGIC.every((b, i) => buffer[i] === b);
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<import('exceljs').Workbook|null>}
 */
export async function loadExcelJsWorkbook(buffer) {
  if (!buffer?.length) return null;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

/**
 * 按 SheetJS 使用的矩阵行序读取行高（像素）。
 * @param {import('exceljs').Worksheet} worksheet
 * @param {number} startRow0 Sheet 绝对行 0-based（与 XLSX !ref 的 s.r 一致）
 * @param {number} rowCount
 */
export function readExcelJsRowHeightsPx(worksheet, startRow0, rowCount) {
  if (!worksheet || rowCount <= 0) return [];
  const defaultPt = worksheet.properties?.defaultRowHeight;
  const defaultPx =
    defaultPt != null && !Number.isNaN(Number(defaultPt)) && Number(defaultPt) > 0
      ? pointsToPixels(defaultPt)
      : 0;

  const heights = [];
  for (let i = 0; i < rowCount; i += 1) {
    const excelRow1 = startRow0 + i + 1;
    const row = worksheet.getRow(excelRow1);
    let px = 0;
    if (row.height != null && !Number.isNaN(Number(row.height)) && Number(row.height) > 0) {
      px = pointsToPixels(row.height);
    } else if (defaultPx > 0) {
      // WPS 等：行标记 customHeight 但未写 ht 时，ExcelJS 常无 row.height，用工作表默认行高
      px = defaultPx;
    }
    heights.push(px);
  }
  return heights;
}

/**
 * @param {import('exceljs').Workbook} excelWorkbook
 * @param {string} sheetName
 * @param {number} startRow0
 * @param {number} rowCount
 */
export function readExcelJsSheetRowHeightsPx(excelWorkbook, sheetName, startRow0, rowCount) {
  if (!excelWorkbook) return [];
  const ws = excelWorkbook.getWorksheet(sheetName);
  if (!ws) return [];
  return readExcelJsRowHeightsPx(ws, startRow0, rowCount);
}

/** Excel 列宽（字符单位）→ 像素，与 SheetJS colWidthToPixels 一致 */
export function excelColWidthToPixels(width) {
  if (width == null || Number.isNaN(Number(width)) || Number(width) <= 0) return 0;
  return Math.round(Number(width) * 7.5 + 8);
}

/**
 * @param {import('exceljs').Worksheet} worksheet
 * @param {number} startCol0 Sheet 绝对列 0-based（与 XLSX !ref 的 s.c 一致）
 * @param {number} colCount
 */
export function readExcelJsColWidthsPx(worksheet, startCol0, colCount) {
  if (!worksheet || colCount <= 0) return [];
  const defaultW = worksheet.properties?.defaultColWidth;
  const defaultPx =
    defaultW != null && !Number.isNaN(Number(defaultW)) && Number(defaultW) > 0
      ? excelColWidthToPixels(defaultW)
      : 0;

  const widths = [];
  for (let i = 0; i < colCount; i += 1) {
    const col = worksheet.getColumn(startCol0 + i + 1);
    let px = 0;
    if (col.width != null && !Number.isNaN(Number(col.width)) && Number(col.width) > 0) {
      px = excelColWidthToPixels(col.width);
    } else if (defaultPx > 0) {
      px = defaultPx;
    }
    widths.push(px);
  }
  return widths;
}

export function readExcelJsSheetColWidthsPx(excelWorkbook, sheetName, startCol0, colCount) {
  if (!excelWorkbook) return [];
  const ws = excelWorkbook.getWorksheet(sheetName);
  if (!ws) return [];
  return readExcelJsColWidthsPx(ws, startCol0, colCount);
}
