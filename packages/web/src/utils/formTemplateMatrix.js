/**
 * 表样矩阵合并单元格 → 渲染用 colspan/rowspan 映射
 */

/** @typedef {{ s: { r: number, c: number }, e: { r: number, c: number } }} MergeRange */

/**
 * @param {MergeRange[]} merges
 * @returns {{ covered: Set<string>, spanAt: Map<string, { rowspan: number, colspan: number }> }}
 */
export function buildMergeRenderMap(merges = []) {
  const covered = new Set();
  const spanAt = new Map();

  for (const m of merges) {
    const rowspan = m.e.r - m.s.r + 1;
    const colspan = m.e.c - m.s.c + 1;
    spanAt.set(`${m.s.r},${m.s.c}`, { rowspan, colspan });
    for (let r = m.s.r; r <= m.e.r; r += 1) {
      for (let c = m.s.c; c <= m.e.c; c += 1) {
        if (r !== m.s.r || c !== m.s.c) {
          covered.add(`${r},${c}`);
        }
      }
    }
  }

  return { covered, spanAt };
}

/**
 * @param {unknown} value
 */
export function formatMatrixCell(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}
