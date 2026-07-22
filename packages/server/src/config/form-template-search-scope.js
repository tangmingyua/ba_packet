/**
 * 1104 表样搜索范围：仅数据行中的指标名/项目名列（不含表头、列维度 A/B/C 等）
 */

/** 0-based：第 1 列序号后，第 2 列项目/账户类别，第 3 列子项/指标名 */
export const INDICATOR_SEARCH_COLS = [1, 2];

function cellText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** 数据行：A 列为正整数序号（跳过表头、分表标题行） */
export function isIndicatorDataRow(matrix, rowIndex) {
  const row = matrix[rowIndex] || [];
  const raw = row[0];
  if (raw === null || raw === undefined || raw === '') return false;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && Math.floor(n) === n;
}

/** @param {unknown[][]} matrix */
export function* iterIndicatorSearchCells(matrix) {
  for (let r = 0; r < matrix.length; r += 1) {
    if (!isIndicatorDataRow(matrix, r)) continue;
    const line = matrix[r] || [];
    for (const c of INDICATOR_SEARCH_COLS) {
      if (c >= line.length) continue;
      yield { row: r, col: c, text: cellText(line[c]) };
    }
  }
}
