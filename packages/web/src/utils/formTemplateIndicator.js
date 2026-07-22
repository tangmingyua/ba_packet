/**
 * 从表样单元格文本解析指标序号
 * 例：`4. 存放同业款项` → `4`；`4.1 境内商业银行` → `4.1`；`25a.境外…` → `25a`
 */
export function parseIndicatorKeyFromCell(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d+(?:\.\d+)*[a-zA-Z]?)\s*[.．、]?\s*/);
  if (!m) return null;
  // 排除纯章节如「1」后面没有名称且整段很短？保留：只要像指标编号即可
  return m[1];
}

/**
 * 是否可作为「点击查说明」的指标单元格（数据行 + 项目名列）
 */
export function isClickableIndicatorCell(matrix, rowIndex, colIndex) {
  if (colIndex !== 1) return false;
  const row = matrix?.[rowIndex] || [];
  const raw = row[0];
  if (raw === null || raw === undefined || raw === '') return false;
  const n = Number(raw);
  if (!(Number.isFinite(n) && n >= 1 && Math.floor(n) === n)) return false;
  return Boolean(parseIndicatorKeyFromCell(row[1]));
}
