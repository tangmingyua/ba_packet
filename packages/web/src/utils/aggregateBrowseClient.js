import { getRowValueForExcelColumn } from '../composables/useDynamicTable.js';
import { compareVersionLabelsDesc } from './versionSort.js';

function cellToString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * 按聚合列对前端展示行再分组（与后端 aggregate-browse 索引一致，便于套默认筛选）
 */
export function buildAggregateBrowseItemsFromRows(rows, columns) {
  if (!columns?.length || !rows?.length) return [];

  const bucket = new Map();
  for (const row of rows) {
    const values = {};
    const keyParts = [];
    for (const { code, label } of columns) {
      const v = cellToString(getRowValueForExcelColumn(row, label));
      values[label] = v;
      keyParts.push(`${code}\u0000${v}`);
    }
    const key = keyParts.join('\u0001');
    if (!bucket.has(key)) {
      bucket.set(key, { values, count: 0 });
    }
    bucket.get(key).count += 1;
  }

  const versionCol = columns.find((c) => c.code === 'version');

  return [...bucket.values()]
    .sort((a, b) => {
      if (versionCol) {
        const vcmp = compareVersionLabelsDesc(
          a.values[versionCol.label],
          b.values[versionCol.label]
        );
        if (vcmp !== 0) return vcmp;
      }
      for (const { label } of columns) {
        if (versionCol && label === versionCol.label) continue;
        const cmp = (a.values[label] || '').localeCompare(b.values[label] || '', 'zh-CN');
        if (cmp !== 0) return cmp;
      }
      return 0;
    })
    .map((entry) => ({
      values: entry.values,
      count: entry.count,
    }));
}
