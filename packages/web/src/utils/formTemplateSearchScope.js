/**
 * 前端与后端一致的表样搜索范围判定
 */
export const INDICATOR_SEARCH_COLS = [1, 2];

export function cellText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function isIndicatorDataRow(matrix, rowIndex) {
  const row = matrix[rowIndex] || [];
  const raw = row[0];
  if (raw === null || raw === undefined || raw === '') return false;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && Math.floor(n) === n;
}

export function isIndicatorSearchColumn(colIndex) {
  return INDICATOR_SEARCH_COLS.includes(colIndex);
}

export function shouldSearchCell(matrix, rowIndex, colIndex) {
  if (isIndicatorDataRow(matrix, rowIndex)) {
    return isIndicatorSearchColumn(colIndex);
  }
  return true;
}
