import {
  INDICATOR_SEARCH_COLS,
  isIndicatorDataRow,
} from './formTemplateSearchScope.js';

/**
 * 从表样单元格文本解析指标序号
 * 例：`4. 存放同业款项` → `4`；`4.1 境内商业银行` → `4.1`；`25a.境外…` → `25a`
 */
export function parseIndicatorKeyFromCell(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d+(?:\.\d+)*[a-zA-Z]?)\s*[.．、]?\s*/);
  if (!m) return null;
  return m[1];
}

/**
 * 解析某数据行可点击单元格对应的指标 key
 * - B/C 列带「4.」「4.1」前缀时从文本解析
 * - B 列仅名称、A 列有序号时回退为 A 列整数（G0100 主表常见）
 */
export function resolveIndicatorKeyAtCell(matrix, rowIndex, colIndex) {
  if (!isIndicatorDataRow(matrix, rowIndex)) return null;
  if (!INDICATOR_SEARCH_COLS.includes(colIndex)) return null;

  const row = matrix[rowIndex] || [];
  const text = String(row[colIndex] ?? '').trim();
  if (!text) return null;

  const fromText = parseIndicatorKeyFromCell(text);
  if (fromText) return fromText;

  // B 列仅名称、且 C 列无子项时，用 A 列整数（G0100 主表）
  if (colIndex === 1) {
    const col2 = String(row[2] ?? '').trim();
    if (col2) return null;
    const n = Number(row[0]);
    if (Number.isFinite(n) && n >= 1 && Math.floor(n) === n) {
      return String(n);
    }
  }

  return null;
}

/**
 * 是否可作为「点击查说明」的指标单元格（数据行 + B/C 项目名列）
 */
export function isClickableIndicatorCell(matrix, rowIndex, colIndex) {
  return Boolean(resolveIndicatorKeyAtCell(matrix, rowIndex, colIndex));
}
