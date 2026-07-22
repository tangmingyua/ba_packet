/**
 * 1104 表样搜索范围
 * - 表头行：所有非空单元格
 * - 数据行（A 列序号）：仅项目名/子项名列（B、C 列）
 */

/** 0-based：序号列后的项目名、子项名 */
export const INDICATOR_SEARCH_COLS = [1, 2];

export function cellText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** 数据行：A 列为正整数序号 */
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

/**
 * @param {unknown[][]} matrix
 * @param {(ctx: { row: number, col: number, text: string, cellKind: 'header' | 'indicator' }) => void} visit
 */
export function forEachSearchableCell(matrix, visit) {
  for (let r = 0; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    if (isIndicatorDataRow(matrix, r)) {
      for (const c of INDICATOR_SEARCH_COLS) {
        if (c >= line.length) continue;
        const text = cellText(line[c]);
        if (!text) continue;
        visit({ row: r, col: c, text, cellKind: 'indicator' });
      }
      continue;
    }
    for (let c = 0; c < line.length; c += 1) {
      const text = cellText(line[c]);
      if (!text) continue;
      visit({ row: r, col: c, text, cellKind: 'header' });
    }
  }
}

/** @deprecated 使用 forEachSearchableCell */
export const forEachIndicatorCell = forEachSearchableCell;
