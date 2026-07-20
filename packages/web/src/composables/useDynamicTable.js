import {
  excelColumnLabel,
  excelColumnLabelsForCode,
  fieldLabel,
  mergeFieldLabels as mergeFieldLabelsFromUtil,
  mergeFieldMappingDefaultDisplayByVersion as mergeFieldMappingDefaultDisplayByVersionFromUtil,
  mergeFieldMappingOrdersByVersion as mergeFieldMappingOrdersByVersionFromUtil,
  mergeFieldMappingsByVersion as mergeFieldMappingsByVersionFromUtil,
  mergeDefaultDisplayLabels,
  mergeMappingOrderedLabels,
  pickTableNameFromPayload,
  TABLE_NAME_PAYLOAD_KEYS,
} from '../utils/fieldLabels.js';
import { getCategoryLabel } from '../constants/materialCategories.js';

export const PAGE_SIZE = 10;

/** 内部字段：表名筛选用，不参与列展示 */
export const ROW_TABLE_KEY = '$tableName';

const SYSTEM_COL_CATEGORY = '分类';
const SYSTEM_COL_TYPE = '类型';

/** 查规范 / 聚合：主列按标准字段 code 排序，展示名由映射反推为 Excel 列名 */
const NORM_PRIMARY_STD_CODES = [
  ['version'],
  TABLE_NAME_PAYLOAD_KEYS,
  ['data_item'],
  ['data_element_desc'],
  ['remark'],
];

const NORM_SECONDARY_STD_CODES = [
  'table_no',
  'table_code',
  'data_item_code',
  'indicator_code',
  'source_table',
  'source_field_name',
  'logic',
  'collection_scope',
  'data_source_scope',
  'east_table_name',
  'east_field_name',
  'r1104_table_name',
  'r1104_indicator',
  'check_table_name',
  'check_rule_code',
];

const NORM_TRUNCATABLE_STD_CODES = ['data_element_desc', 'remark', 'collection_scope', 'data_source_scope', 'logic'];

/** 答疑动态主列（标准字段 code） */
const QA_PRIMARY_STD_CODES = [
  ['version'],
  TABLE_NAME_PAYLOAD_KEYS,
  ['data_item', 'indicator_name', 'key_indicator_name'],
  ['question_no'],
  ['question_type', 'convert_issue_type', 'check_category_major'],
  ['question_desc'],
  ['question_suggestion', 'modify_suggestion'],
  ['lead_unit_advice', 'feedback_opinion', 'bureau_opinion'],
  ['feedback_by', 'proposer', 'reporting_org'],
];

const QA_TRUNCATABLE_STD_CODES = [
  'question_desc',
  'question_suggestion',
  'lead_unit_advice',
  'feedback_opinion',
  'bureau_opinion',
  'modify_suggestion',
  'data_element_desc',
  'remark',
  'formula_desc',
];

const QA_DESC_STD_CODES = [
  'question_desc',
  'question_suggestion',
  'lead_unit_advice',
  'data_element_desc',
  'feedback_opinion',
  'bureau_opinion',
];

const QA_CODE_STD_CODES = ['table_no', 'table_code', 'data_item_code', 'question_no', 'indicator_code'];

const QA_GROUP_STD_CODES = [
  'table_name',
  'table_name_main',
  'table_name_sub',
  'east_table_name',
  'r1104_table_name',
];

export function mergeFieldLabels(labels) {
  return mergeFieldLabelsFromUtil(labels);
}

export function mergeFieldMappingsByVersion(mappingsByVersion) {
  return mergeFieldMappingsByVersionFromUtil(mappingsByVersion);
}

export function mergeFieldMappingOrdersByVersion(ordersByVersion) {
  return mergeFieldMappingOrdersByVersionFromUtil(ordersByVersion);
}

export function mergeFieldMappingDefaultDisplayByVersion(defaultDisplayByVersion) {
  return mergeFieldMappingDefaultDisplayByVersionFromUtil(defaultDisplayByVersion);
}
const SKIP_PAYLOAD_KEYS = new Set(['subtype', 'version']);

function resolveLabelsForCodes(codeGroups, allKeys) {
  const labels = [];
  const used = new Set();
  const groups = Array.isArray(codeGroups[0]) ? codeGroups : [codeGroups];

  for (const codes of groups) {
    for (const code of codes) {
      const pick = excelColumnLabelsForCode(code, allKeys).find((l) => !used.has(l));
      if (pick) {
        labels.push(pick);
        used.add(pick);
        break;
      }
    }
  }
  return labels;
}

function resolveLabelsForCodeList(codes, allKeys) {
  const labels = [];
  const used = new Set();
  for (const code of codes) {
    for (const label of excelColumnLabelsForCode(code, allKeys)) {
      if (!used.has(label)) {
        labels.push(label);
        used.add(label);
      }
    }
  }
  return labels;
}

/** 单条记录 → 展示行（Excel 原列名为键） */
export function itemToDisplayRow(item, report, block, mode) {
  const payload = item.payload || {};
  const versionId = item.subtypeVersionId;
  const col = (code) => excelColumnLabel(code, versionId);
  const row = {};

  if (mode === 'aggregate') {
    row[SYSTEM_COL_TYPE] = item.categoryLabel || getCategoryLabel(item.category || 'norm');
  }
  row[SYSTEM_COL_CATEGORY] = report?.name || item.subtype || '';

  const versionVal = item.version || block?.versionLabel || block?.tableName || '';
  if (versionVal) {
    row[col('version')] = versionVal;
  }

  const tableVal = pickTableNameFromPayload(payload);
  if (tableVal) {
    row[ROW_TABLE_KEY] = tableVal;
  }

  const dataItemVal = item.dataItemName || payload.data_item || '';
  if (dataItemVal) {
    row[col('data_item')] = dataItemVal;
  }

  for (const [code, val] of Object.entries(payload)) {
    if (SKIP_PAYLOAD_KEYS.has(code)) continue;
    if (code === 'data_item' || code === 'version') continue;
    const label = col(code);
    if (row[label] == null || row[label] === '') {
      row[label] = val != null ? String(val) : '';
    }
  }

  return row;
}
/** 扁平化 reports → 行数组 */
export function flattenReports(reports, { reportCode, mode = 'norm' } = {}) {
  const rows = [];
  const list = reportCode ? reports.filter((r) => r.code === reportCode) : reports;
  for (const report of list) {
    for (const block of report.blocks || []) {
      for (const item of block.items || []) {
        rows.push(itemToDisplayRow(item, report, block, mode));
      }
    }
  }
  return rows;
}

/** 扁平化单个 report（qa/aggregate 子类 Tab） */
export function flattenReport(report, mode = 'qa') {
  const rows = [];
  if (!report) return rows;
  for (const block of report.blocks || []) {
    for (const item of block.items || []) {
      rows.push(itemToDisplayRow(item, report, block, mode));
    }
  }
  return rows;
}

function collectColumnKeys(rows) {
  const keys = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (k.startsWith('$')) continue;
      if (row[k] != null && String(row[k]).trim() !== '') keys.add(k);
    }
  }
  return [...keys];
}

function buildDisplayColumnOrder(allKeys, mode) {
  const prefix = [];
  if (mode === 'aggregate' && allKeys.includes(SYSTEM_COL_TYPE)) {
    prefix.push(SYSTEM_COL_TYPE);
  }
  if (allKeys.includes(SYSTEM_COL_CATEGORY)) {
    prefix.push(SYSTEM_COL_CATEGORY);
  }
  for (const label of excelColumnLabelsForCode('version', allKeys)) {
    if (!prefix.includes(label)) prefix.push(label);
  }

  const prefixSet = new Set(prefix);
  const orderedMapped = mergeMappingOrderedLabels(allKeys).filter((col) => !prefixSet.has(col));
  const defaultVisibleSet = new Set(mergeDefaultDisplayLabels(allKeys));

  const primaryFromMapped = orderedMapped.filter((col) => defaultVisibleSet.has(col));
  const secondaryFromMapped = orderedMapped.filter((col) => !defaultVisibleSet.has(col));

  const used = new Set([...prefix, ...orderedMapped]);
  const rest = allKeys.filter((k) => !used.has(k));

  return {
    displayCols: [...prefix, ...orderedMapped, ...rest],
    primaryCols: [...prefix, ...primaryFromMapped],
    secondaryCols: [...secondaryFromMapped, ...rest],
  };
}

function buildColumnMetaFromKeys(allKeys, mode) {
  const { displayCols, primaryCols, secondaryCols } = buildDisplayColumnOrder(allKeys, mode);

  const truncatableStd =
    mode === 'qa'
      ? QA_TRUNCATABLE_STD_CODES
      : mode === 'aggregate'
        ? [...new Set([...NORM_TRUNCATABLE_STD_CODES, ...QA_TRUNCATABLE_STD_CODES])]
        : NORM_TRUNCATABLE_STD_CODES;

  const descStd =
    mode === 'qa'
      ? QA_DESC_STD_CODES
      : mode === 'aggregate'
        ? [...new Set([...NORM_TRUNCATABLE_STD_CODES.filter((c) => c === 'data_element_desc'), ...QA_DESC_STD_CODES])]
        : ['data_element_desc'];

  return {
    displayCols,
    primaryCols,
    secondaryCols,
    truncatableLabels: resolveLabelsForCodeList(truncatableStd, allKeys).filter((l) =>
      displayCols.includes(l)
    ),
    descLabels: resolveLabelsForCodeList(descStd, allKeys).filter((l) => displayCols.includes(l)),
    highlightLabels: resolveSearchHighlightLabels(mode, allKeys),
    codeLabels: resolveLabelsForCodeList(
      mode === 'qa' ? QA_CODE_STD_CODES : ['table_no', 'table_code', 'data_item_code', 'indicator_code', 'check_rule_code'],
      allKeys
    ).filter((l) => displayCols.includes(l)),
    groupLabels: [],
  };
}

/** 搜索结果中需高亮关键词的列 */
function resolveSearchHighlightLabels(mode, allKeys) {
  if (mode === 'norm') {
    return resolveLabelsForCodeList(
      ['data_item', 'table_name', 'table_name_main', 'data_element_desc'],
      allKeys
    );
  }
  if (mode === 'qa') {
    return resolveLabelsForCodeList(
      ['data_item', 'table_name', 'table_name_main', 'question_desc'],
      allKeys
    );
  }
  return resolveLabelsForCodeList(
    ['data_item', 'table_name', 'table_name_main', 'data_element_desc', 'question_desc'],
    allKeys
  );
}

export function filterColumnSuggestions(columnOptions, query, limit = 12) {
  const q = String(query ?? '').trim().toLowerCase();
  const list = columnOptions || [];
  if (!q) return list.slice(0, limit);
  return list.filter((col) => col.toLowerCase().includes(q)).slice(0, limit);
}
/** 根据 mode 与行数据生成列元信息 */
export function buildColumnMeta(rows, mode) {
  const allKeys = collectColumnKeys(rows);
  if (!allKeys.length) {
    return {
      displayCols: [],
      primaryCols: [],
      secondaryCols: [],
      truncatableLabels: [],
      descLabels: [],
      highlightLabels: [],
      codeLabels: [],
      groupLabels: [],
    };
  }

  return buildColumnMetaFromKeys(allKeys, mode);
}
/** 客户端筛选运算符 */
export const FILTER_OPERATORS = [
  { value: 'contains', label: '包含' },
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lte', label: '小于等于' },
  { value: 'starts_with', label: '开头是' },
  { value: 'ends_with', label: '结尾是' },
  { value: 'empty', label: '为空' },
  { value: 'not_empty', label: '不为空' },
];

export const NO_VALUE_OPERATORS = new Set(['empty', 'not_empty']);

let filterRuleSeq = 0;

export function createFilterRule(overrides = {}) {
  filterRuleSeq += 1;
  return {
    id: `f_${Date.now()}_${filterRuleSeq}`,
    col: '',
    op: 'contains',
    val: '',
    ...overrides,
  };
}

export function normalizeActiveFilters(rules) {
  return (rules || [])
    .filter((r) => r.col && (NO_VALUE_OPERATORS.has(r.op) || String(r.val ?? '').trim()))
    .map((r) => ({ ...r, val: String(r.val ?? '').trim() }));
}

function compareValues(cellVal, filterVal, op) {
  const numCell = parseFloat(cellVal);
  const numFilter = parseFloat(filterVal);
  if (!Number.isNaN(numCell) && !Number.isNaN(numFilter) && filterVal !== '') {
    if (op === 'gt') return numCell > numFilter;
    if (op === 'lt') return numCell < numFilter;
    if (op === 'gte') return numCell >= numFilter;
    if (op === 'lte') return numCell <= numFilter;
  }
  const cmp = cellVal.localeCompare(filterVal, 'zh-CN');
  if (op === 'gt') return cmp > 0;
  if (op === 'lt') return cmp < 0;
  if (op === 'gte') return cmp >= 0;
  if (op === 'lte') return cmp <= 0;
  return false;
}

export function matchesFilterRule(row, rule) {
  const cellVal = String(row[rule.col] ?? '').trim();
  const filterVal = String(rule.val ?? '').trim();
  const lowerCell = cellVal.toLowerCase();
  const lowerFilter = filterVal.toLowerCase();

  switch (rule.op) {
    case 'empty':
      return cellVal === '';
    case 'not_empty':
      return cellVal !== '';
    case 'eq':
      return lowerCell === lowerFilter;
    case 'ne':
      return lowerCell !== lowerFilter;
    case 'contains':
      return lowerCell.includes(lowerFilter);
    case 'starts_with':
      return lowerCell.startsWith(lowerFilter);
    case 'ends_with':
      return lowerCell.endsWith(lowerFilter);
    case 'gt':
    case 'lt':
    case 'gte':
    case 'lte':
      return compareValues(cellVal, filterVal, rule.op);
    default:
      return lowerCell.includes(lowerFilter);
  }
}

/** 客户端筛选 */
export function filterRows(rows, { tableFilter, customFilters = [], localKeyword } = {}) {
  let result = rows;
  if (tableFilter && tableFilter !== '__all__') {
    result = result.filter((r) => r[ROW_TABLE_KEY] === tableFilter);
  }
  const activeRules = normalizeActiveFilters(customFilters);
  if (activeRules.length) {
    result = result.filter((row) => activeRules.every((rule) => matchesFilterRule(row, rule)));
  }
  if (localKeyword) {
    const lower = localKeyword.toLowerCase();
    result = result.filter((r) =>
      Object.values(r).some((v) =>
        String(v ?? '')
          .toLowerCase()
          .includes(lower)
      )
    );
  }
  return result;
}

export function getTableOptions(rows) {
  const counts = new Map();
  for (const row of rows) {
    const name = row[ROW_TABLE_KEY] || '';
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
    .map(([name, count]) => ({ name, count }));
}

export function getColumnOptions(rows) {
  const keys = collectColumnKeys(rows);
  const mapped = mergeMappingOrderedLabels(keys);
  const mappedSet = new Set(mapped);
  const rest = keys.filter((k) => !mappedSet.has(k));
  return [...mapped, ...rest];
}

export function paginateRows(rows, page, pageSize = PAGE_SIZE) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    total,
    totalPages,
    page: safePage,
    start,
  };
}

/** 分页页码列表（含省略号逻辑，与参考稿一致） */
export function buildPageList(currentPage, totalPages, maxVisible = 7) {
  if (totalPages <= 1) return [];
  let startPage;
  let endPage;
  if (totalPages <= maxVisible) {
    startPage = 1;
    endPage = totalPages;
  } else {
    startPage = Math.max(1, currentPage - 3);
    endPage = Math.min(totalPages, currentPage + 3);
    if (currentPage <= 4) {
      startPage = 1;
      endPage = maxVisible;
    }
    if (currentPage >= totalPages - 3) {
      startPage = totalPages - maxVisible + 1;
      endPage = totalPages;
    }
  }

  const items = [];
  if (startPage > 1) {
    items.push({ type: 'page', page: 1 });
    if (startPage > 2) items.push({ type: 'ellipsis' });
  }
  for (let i = startPage; i <= endPage; i++) {
    items.push({ type: 'page', page: i, active: i === currentPage });
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) items.push({ type: 'ellipsis' });
    items.push({ type: 'page', page: totalPages });
  }
  return items;
}

export function exportRowsCsv(rows, columns, filename) {
  if (!rows.length || !columns.length) return;
  let csv = '\uFEFF';
  csv += columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',') + '\n';
  for (const row of rows) {
    csv +=
      columns
        .map((c) => {
          const v = String(row[c] ?? '').replace(/"/g, '""');
          return `"${v}"`;
        })
        .join(',') + '\n';
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `口袋BA查询结果_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightKeyword(text, keyword) {
  if (!keyword || !text) return text;
  const re = new RegExp(`(${escapeRegex(keyword)})`, 'gi');
  return String(text).replace(re, '<mark class="kw-highlight">$1</mark>');
}

export async function copyText(text) {
  const value = String(text ?? '');
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}
