import { getRowValueForExcelColumn, ROW_CATALOG_SEQ_KEY } from '../composables/useDynamicTable.js';
import { compareVersionLabelsDesc } from './versionSort.js';
import { bucketCatalogSeqMin, parseCatalogSeq } from '../../../server/src/utils/catalog-seq.js';

function cellToString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * 按聚合列对前端展示行再分组（与后端 aggregate-browse 索引一致，便于套默认筛选）
 */
export function buildAggregateBrowseItemsFromRows(rows, columns) {
  if (!columns?.length || !rows?.length) return [];

  const useCatalogOrder = rows.some((row) => row[ROW_CATALOG_SEQ_KEY] != null);
  const rowsForAgg = useCatalogOrder
    ? rows.filter((row) => row[ROW_CATALOG_SEQ_KEY] != null)
    : rows;
  if (!rowsForAgg.length) return [];

  const bucket = new Map();
  for (const row of rowsForAgg) {
    const values = {};
    const keyParts = [];
    for (const { code, label } of columns) {
      const v = cellToString(getRowValueForExcelColumn(row, label));
      values[label] = v;
      keyParts.push(`${code}\u0000${v}`);
    }
    const key = keyParts.join('\u0001');
    if (!bucket.has(key)) {
      bucket.set(key, { values, count: 0, catalogSeqMin: null });
    }
    const entry = bucket.get(key);
    entry.count += 1;
    bucketCatalogSeqMin(entry, row[ROW_CATALOG_SEQ_KEY] ?? null);
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
      if (useCatalogOrder) {
        const aSeq = a.catalogSeqMin ?? Number.MAX_SAFE_INTEGER;
        const bSeq = b.catalogSeqMin ?? Number.MAX_SAFE_INTEGER;
        if (aSeq !== bSeq) return aSeq - bSeq;
        return 0;
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

export { parseCatalogSeq };
