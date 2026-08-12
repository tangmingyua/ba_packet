/**
 * 空关键词浏览：按「聚合展示」字段组合去重索引
 */
import { queryOne } from '../db/database.js';
import { getSubtype, listFieldMappings } from './dataset-config.js';
import { resolveSearchMode, queryDatasetMatchingRows } from './dataset-search.js';
import { compareVersionLabelsDesc } from '../utils/version-sort.js';
import { bucketCatalogSeqMin, parseCatalogSeq } from '../utils/catalog-seq.js';

function parsePayload(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

function cellToString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** 跨版本合并聚合列：版本始终参与聚合，其余为「聚合展示」字段 */
export function collectAggregateColumnDefs(versionIds) {
  const sortedIds = [...versionIds].sort((a, b) => a - b);
  const seen = new Set();
  const cols = [];

  for (const vid of sortedIds) {
    const versionMap = listFieldMappings(vid).find((m) => m.standardField === 'version');
    if (versionMap?.originalColumn) {
      seen.add('version');
      cols.push({ code: 'version', label: versionMap.originalColumn });
      break;
    }
  }
  if (!seen.has('version')) {
    seen.add('version');
    cols.push({ code: 'version', label: '版本' });
  }

  for (const vid of sortedIds) {
    for (const m of listFieldMappings(vid)) {
      if (!m.aggregateDisplay) continue;
      if (seen.has(m.standardField)) continue;
      seen.add(m.standardField);
      cols.push({ code: m.standardField, label: m.originalColumn });
    }
  }
  return cols;
}

function aggregateCellValue(row, payload, code) {
  if (code === 'version') {
    return cellToString(row.std_version || row.version_label || payload.version);
  }
  return cellToString(payload[code]);
}

function buildFiltersForValues(columnDefs, values) {
  return columnDefs.map(({ label }) => {
    const val = values[label] ?? '';
    if (val === '') {
      return { col: label, op: 'empty', val: '' };
    }
    return { col: label, op: 'eq', val };
  });
}

/**
 * @returns {null | { columns: { code, label }[], items: { values, count, filters }[] }}
 */
export function buildAggregateBrowseIndex({ subtypeCode, moduleCode, categories, mode }) {
  const st = getSubtype(subtypeCode);
  if (!st?.enabled || st.storageKind !== 'excel' || st.category !== 'norm') {
    return null;
  }

  const rows = queryDatasetMatchingRows({
    keyword: '',
    mode,
    categories,
    moduleCode,
    subtypeCode,
  });
  if (!rows.length) return null;

  const parsedRows = rows.map((row) => ({
    row,
    payload: parsePayload(row.payload),
  }));
  const useCatalogOrder = parsedRows.some(({ payload }) => parseCatalogSeq(payload) != null);
  const rowsForAgg = useCatalogOrder
    ? parsedRows.filter(({ payload }) => parseCatalogSeq(payload) != null)
    : parsedRows;
  if (!rowsForAgg.length) return null;

  const versionIds = [...new Set(rowsForAgg.map(({ row }) => row.subtype_version_id))];
  const columnDefs = collectAggregateColumnDefs(versionIds);
  const hasAggregateDisplayCol = columnDefs.some((c) => c.code !== 'version');
  if (!hasAggregateDisplayCol) return null;

  const bucket = new Map();

  for (const { row, payload } of rowsForAgg) {
    const values = {};
    const keyParts = [];
    for (const { code, label } of columnDefs) {
      const v = aggregateCellValue(row, payload, code);
      values[label] = v;
      keyParts.push(`${code}\u0000${v}`);
    }
    const key = keyParts.join('\u0001');
    if (!bucket.has(key)) {
      bucket.set(key, { values, count: 0, catalogSeqMin: null });
    }
    const entry = bucket.get(key);
    entry.count += 1;
    bucketCatalogSeqMin(entry, parseCatalogSeq(payload));
  }

  const versionCol = columnDefs.find((c) => c.code === 'version');

  const items = [...bucket.values()]
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
      for (const { label } of columnDefs) {
        if (versionCol && label === versionCol.label) continue;
        const cmp = (a.values[label] || '').localeCompare(b.values[label] || '', 'zh-CN');
        if (cmp !== 0) return cmp;
      }
      return 0;
    })
    .map((entry) => ({
      values: entry.values,
      count: entry.count,
      filters: buildFiltersForValues(columnDefs, entry.values),
    }));

  return {
    columns: columnDefs.map(({ code, label }) => ({ code, label })),
    items,
  };
}
