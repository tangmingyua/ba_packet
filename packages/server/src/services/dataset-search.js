/**
 * 新模型搜索 / 联想（data_records）
 * 按模式限定搜索字段：规范=表名+数据项+填报规范；答疑=表名+数据项+问题描述
 */
import { queryAll, queryOne } from '../db/database.js';
import { listFieldMappings, listStandardFields } from './dataset-config.js';
import {
  buildBrowseWhereSql,
  buildSearchMatchParams,
  buildSearchMatchSql,
  payloadMatchesKeyword,
  resolveSuggestTableNameFromPayload,
  resolveSuggestDataItemLabel,
  scoreSuggestDatasetMatch,
} from './search-fields.js';
import {
  getCategoryLabel,
  parseCategoryFilter,
  expandCategoriesForStorage,
} from '../config/material-categories.js';
import { compareVersionLabelsDesc } from '../utils/version-sort.js';
import { sqlExcludeHiddenSubtypeNames } from '../config/query-hidden-subtypes.js';

function parsePayload(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

function tableExists(name) {
  const row = queryOne(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [name]
  );
  return Boolean(row);
}

/** norm | qa | aggregate（不过滤） */
export function resolveSearchMode(mode) {
  const raw = String(mode ?? 'aggregate').trim().toLowerCase();
  if (raw === 'norm' || raw === '规范') return 'norm';
  if (raw === 'qa' || raw === 'faq' || raw === '答疑') return 'qa';
  return 'aggregate';
}

function categoryFilterClause(mode, categories) {
  const resolved = resolveSearchMode(mode);
  if (resolved === 'aggregate') {
    const selected = expandCategoriesForStorage(parseCategoryFilter(categories));
    if (!selected.length) return { clause: '', params: [] };
    const placeholders = selected.map(() => '?').join(',');
    return {
      clause: ` AND COALESCE(r.std_category, s.category) IN (${placeholders})`,
      params: selected,
    };
  }
  return {
    clause: ' AND COALESCE(r.std_category, s.category) = ?',
    params: [resolved],
  };
}

const RECORD_SELECT = `
  r.*, sv.version_label, s.code AS subtype_code, s.name AS subtype_name,
  COALESCE(r.std_category, s.category, 'norm') AS record_category,
  s.module_code, m.name AS module_name, m.sort_order AS module_sort_order
`;

const RECORD_JOINS = `
  FROM data_records r
  JOIN subtype_versions sv ON sv.id = r.subtype_version_id
  JOIN subtypes s ON s.code = sv.subtype_code
  LEFT JOIN modules m ON m.code = s.module_code
`;

function parseSubtypeFilter(input) {
  if (!input) return [];
  const list = Array.isArray(input)
    ? input
    : String(input)
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
  return [...new Set(list)];
}

export function parseModuleCodeFilter(moduleCode, moduleCodes) {
  if (moduleCodes != null && moduleCodes !== '') {
    const raw = Array.isArray(moduleCodes) ? moduleCodes : String(moduleCodes).split(/[,，]/);
    const list = raw.map((s) => String(s).trim()).filter(Boolean);
    if (list.length) return [...new Set(list)];
  }
  const mod = String(moduleCode ?? '').trim();
  return mod ? [mod] : [];
}

function queryMatchingRows({
  keyword,
  mode,
  versionId,
  distinct = false,
  categories,
  moduleCode,
  moduleCodes,
  subtypeCode,
}) {
  const q = String(keyword ?? '').trim();
  const matchSql = q ? buildSearchMatchSql(mode) : buildBrowseWhereSql();
  const matchParams = q ? buildSearchMatchParams(q, mode) : [];
  const { clause, params: categoryParams } = categoryFilterClause(mode, categories);

  const params = [...matchParams, ...categoryParams];
  const modList = parseModuleCodeFilter(moduleCode, moduleCodes);
  const subtypes = parseSubtypeFilter(subtypeCode);
  let moduleClause = '';
  if (modList.length === 1) {
    moduleClause = ' AND s.module_code = ?';
    params.push(modList[0]);
  } else if (modList.length > 1) {
    moduleClause = ` AND s.module_code IN (${modList.map(() => '?').join(',')})`;
    params.push(...modList);
  }
  if (subtypes.length === 1) {
    moduleClause += ' AND s.code = ?';
    params.push(subtypes[0]);
  } else if (subtypes.length > 1) {
    moduleClause += ` AND s.code IN (${subtypes.map(() => '?').join(',')})`;
    params.push(...subtypes);
  } else {
    const hidden = sqlExcludeHiddenSubtypeNames('s');
    moduleClause += hidden.clause;
    params.push(...hidden.params);
  }
  const select = distinct
    ? `SELECT DISTINCT r.std_data_item, r.std_subtype, r.std_version,
           COALESCE(r.std_category, s.category, 'norm') AS record_category,
           s.name AS subtype_name, s.code AS subtype_code,
           s.module_code, m.name AS module_name`
    : `SELECT ${RECORD_SELECT}`;

  let sql = `
    ${select}
    ${RECORD_JOINS}
    WHERE ${matchSql}${clause}${moduleClause}
  `;

  if (versionId) {
    sql += ' AND r.subtype_version_id = ?';
    params.push(Number(versionId));
  }

  if (distinct) {
    sql += ' ORDER BY r.std_data_item';
  } else {
    sql += ' ORDER BY m.sort_order, s.sort_order, sv.id, r.row_num, r.id';
  }

  let rows = queryAll(sql, params);

  if (!rows.length && !distinct && q) {
    const fallbackParams = [...categoryParams];
    let fallbackSql = `
      SELECT ${RECORD_SELECT}
      ${RECORD_JOINS}
      WHERE 1 = 1${clause}${moduleClause}
    `;
    if (versionId) {
      fallbackSql += ' AND r.subtype_version_id = ?';
      fallbackParams.push(Number(versionId));
    }
    fallbackSql += ' ORDER BY m.sort_order, s.sort_order, sv.id, r.row_num, r.id';

    const all = queryAll(fallbackSql, fallbackParams);
    rows = all.filter((row) => payloadMatchesKeyword(parsePayload(row.payload), q, mode));
  }

  return rows;
}

export function queryDatasetMatchingRows(options) {
  return queryMatchingRows(options);
}

function suggestDedupeKey(row, payload, dataItemName, tableName, mode) {
  const resolved = resolveSearchMode(mode);
  if (resolved === 'qa') {
    const qno = String(payload?.question_no ?? '').trim();
    if (qno) return `${row.module_code || ''}\0${qno}`;
    return `${row.module_code || ''}\0${row.id}`;
  }
  return `${row.module_code || ''}\0${dataItemName}\0${tableName}`;
}

/** 联想：在模式限定字段内匹配，返回数据项名称 */
export function suggestDatasetItems(keyword, options = {}) {
  const limit = typeof options === 'number' ? options : Number(options.limit ?? 10);
  const mode = typeof options === 'object' ? options.mode : undefined;
  const q = String(keyword ?? '').trim();
  if (!q) return { items: [] };
  if (!tableExists('data_records')) return { items: [] };

  const rows = queryMatchingRows({
    keyword: q,
    mode,
    distinct: false,
    categories: options.categories,
    moduleCode: options.moduleCode,
    moduleCodes: options.moduleCodes,
    subtypeCode: options.subtypeCode,
  });

  const capped = rows.length > 500 ? rows.slice(0, 500) : rows;
  const seen = new Set();
  const merged = [];
  for (const row of capped) {
    const payload = parsePayload(row.payload);
    const tableName = resolveSuggestTableNameFromPayload(payload);
    const dataItemName = resolveSuggestDataItemLabel(payload, row.std_data_item, mode);
    const dedupeKey = suggestDedupeKey(row, payload, dataItemName, tableName, mode);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    merged.push({
      data_item_name: dataItemName,
      tableName,
      reportCode: row.subtype_code,
      reportName: row.subtype_name || row.std_subtype,
      category: row.record_category || 'norm',
      moduleCode: row.module_code || 'YBT',
      moduleName: row.module_name || row.module_code || '一表通',
      payload,
    });
  }

  const ranked = merged
    .map((row) => ({
      ...row,
      _score: scoreSuggestDatasetMatch(row.payload, row.data_item_name, q, mode),
    }))
    .filter((row) => row._score > 0)
    .sort(
      (a, b) =>
        b._score - a._score ||
        String(a.data_item_name).length - String(b.data_item_name).length
    );

  const items = ranked
    .slice(0, limit)
    .map(({ _score, payload, ...row }) => ({
      dataItemName: row.data_item_name,
      ...(row.tableName ? { tableName: row.tableName } : {}),
      reportCode: row.reportCode,
      reportName: row.reportName,
      category: row.category,
      categoryLabel: getCategoryLabel(row.category),
      moduleCode: row.moduleCode,
      moduleName: row.moduleName,
    }));

  return { items };
}

function compareRowNumAsc(a, b) {
  const ra = a?.rowNum;
  const rb = b?.rowNum;
  const na = ra == null || Number.isNaN(ra) ? null : Number(ra);
  const nb = rb == null || Number.isNaN(rb) ? null : Number(rb);
  if (na == null && nb == null) return 0;
  if (na == null) return 1;
  if (nb == null) return -1;
  if (na !== nb) return na - nb;
  const sa = String(a?.sheetName ?? '');
  const sb = String(b?.sheetName ?? '');
  const scmp = sa.localeCompare(sb, 'zh-CN');
  if (scmp !== 0) return scmp;
  const ia = a?.recordId ?? 0;
  const ib = b?.recordId ?? 0;
  return ia - ib;
}

function sortBlockItemsByExcelRow(items) {
  return [...items].sort(compareRowNumAsc);
}

/** 搜索：按模式字段匹配，按子类分 report，按版本分 block */
export function searchDatasetRecords(keyword, { versionId, mode, categories, moduleCode, subtypeCode } = {}) {
  const q = String(keyword ?? '').trim();
  if (!tableExists('data_records')) {
    return { keyword: q, reports: [] };
  }

  const rows = queryMatchingRows({ keyword: q, mode, versionId, categories, moduleCode, subtypeCode });

  if (!rows.length) {
    return emptySearchResult(q, mode);
  }

  const versionIds = new Set();
  const bySubtype = new Map();
  for (const row of rows) {
    versionIds.add(row.subtype_version_id);
    const code = row.subtype_code;
    const recordCategory = row.record_category || 'norm';
    if (!bySubtype.has(code)) {
      bySubtype.set(code, {
        code,
        name: row.subtype_name,
        moduleCode: row.module_code || 'YBT',
        moduleName: row.module_name || row.module_code || '一表通',
        category: recordCategory,
        categoryLabel: getCategoryLabel(recordCategory),
        layout: 'dataset',
        hitCount: 0,
        blockMap: new Map(),
      });
    }
    const report = bySubtype.get(code);
    report.hitCount += 1;
    const blockKey = row.std_version || row.version_label || '未分版本';
    if (!report.blockMap.has(blockKey)) {
      report.blockMap.set(blockKey, []);
    }
    const payload = parsePayload(row.payload);
    report.blockMap.get(blockKey).push({
      dataItemName: row.std_data_item || payload.data_item || '',
      version: row.std_version || '',
      subtype: row.std_subtype || '',
      subtypeVersionId: row.subtype_version_id,
      rowNum: row.row_num != null ? Number(row.row_num) : null,
      sheetName: row.sheet_name || '',
      recordId: row.id != null ? Number(row.id) : null,
      category: recordCategory,
      categoryLabel: getCategoryLabel(recordCategory),
      moduleCode: report.moduleCode,
      moduleName: report.moduleName,
      payload,
      fields: Object.entries(payload).map(([key, value]) => ({ key, value: String(value ?? '') })),
    });
  }

  const reports = [...bySubtype.values()].map((report) => {
    const blocks = [...report.blockMap.entries()]
      .sort(([ka], [kb]) => compareVersionLabelsDesc(ka, kb))
      .map(([blockKey, items]) => ({
      blockKey,
      tableName: blockKey,
      versionLabel: blockKey,
      tableNo: blockKey,
      items: sortBlockItemsByExcelRow(items),
    }));
    const hitCount = blocks.reduce((sum, block) => sum + block.items.length, 0);
    return {
      code: report.code,
      name: report.name,
      moduleCode: report.moduleCode,
      moduleName: report.moduleName,
      category: report.category,
      categoryLabel: report.categoryLabel,
      layout: 'dataset',
      hitCount,
      blocks,
    };
  });

  const { fieldMappingsByVersion, fieldMappingOrdersByVersion, fieldMappingDefaultDisplayByVersion, fieldMappingDefaultFilterByVersion, fieldMappingAggregateDisplayByVersion } =
    buildFieldMappingsByVersion(versionIds);
  return {
    keyword: q,
    reports,
    mode: resolveSearchMode(mode),
    fieldLabels: buildFieldLabels(fieldMappingsByVersion),
    fieldMappingsByVersion,
    fieldMappingOrdersByVersion,
    fieldMappingDefaultDisplayByVersion,
    fieldMappingDefaultFilterByVersion,
    fieldMappingAggregateDisplayByVersion,
  };
}

function emptySearchResult(keyword, mode) {
  return {
    keyword,
    reports: [],
    mode: resolveSearchMode(mode),
    fieldLabels: buildFieldLabels({}),
    fieldMappingsByVersion: {},
    fieldMappingOrdersByVersion: {},
    fieldMappingDefaultDisplayByVersion: {},
    fieldMappingDefaultFilterByVersion: {},
    fieldMappingAggregateDisplayByVersion: {},
  };
}

function buildFieldMappingsByVersion(versionIds) {
  const fieldMappingsByVersion = {};
  const fieldMappingOrdersByVersion = {};
  const fieldMappingDefaultDisplayByVersion = {};
  const fieldMappingDefaultFilterByVersion = {};
  const fieldMappingAggregateDisplayByVersion = {};
  for (const vid of versionIds) {
    const mappings = listFieldMappings(vid);
    if (!mappings.length) continue;
    const key = String(vid);
    fieldMappingsByVersion[key] = Object.fromEntries(
      mappings.map((m) => [m.standardField, m.originalColumn])
    );
    fieldMappingOrdersByVersion[key] = mappings.map((m) => m.originalColumn);
    fieldMappingDefaultDisplayByVersion[key] = mappings
      .filter((m) => m.defaultDisplay)
      .map((m) => m.originalColumn);
    const configuredFilters = mappings
      .filter((m) => m.defaultFilter)
      .map((m) => m.originalColumn);
    // 版本列必须作为默认筛选（按版本映射后的 Excel 列名，未映射时回退「版本」）
    const versionCol = fieldMappingsByVersion[key]['version'] || '版本';
    const filters = new Set([versionCol, ...configuredFilters]);
    fieldMappingDefaultFilterByVersion[key] = [...filters];
    fieldMappingAggregateDisplayByVersion[key] = mappings
      .filter((m) => m.aggregateDisplay)
      .map((m) => m.originalColumn);
  }
  return {
    fieldMappingsByVersion,
    fieldMappingOrdersByVersion,
    fieldMappingDefaultDisplayByVersion,
    fieldMappingDefaultFilterByVersion,
    fieldMappingAggregateDisplayByVersion,
  };
}

function buildFieldLabels(fieldMappingsByVersion) {
  const labels = Object.fromEntries(listStandardFields().map((f) => [f.code, f.label]));
  for (const map of Object.values(fieldMappingsByVersion)) {
    for (const [code, originalColumn] of Object.entries(map)) {
      if (originalColumn) labels[code] = originalColumn;
    }
  }
  return labels;
}

/** 模块下是否存在 Excel 配置类命中（与 queryMatchingRows 同规则，LIMIT 1 探测） */
export function hasDatasetHitsInModule(keyword, { mode, moduleCode } = {}) {
  const q = String(keyword ?? '').trim();
  const mod = String(moduleCode ?? '').trim();
  if (!q || !mod) return false;
  if (!tableExists('data_records')) return false;

  const matchSql = buildSearchMatchSql(mode);
  const matchParams = buildSearchMatchParams(q, mode);
  const { clause, params: categoryParams } = categoryFilterClause(mode, undefined);

  const hidden = sqlExcludeHiddenSubtypeNames('s');
  const hit = queryOne(
    `SELECT 1 AS hit ${RECORD_JOINS}
     WHERE ${matchSql}${clause} AND s.module_code = ?${hidden.clause}
     LIMIT 1`,
    [...matchParams, ...categoryParams, mod, ...hidden.params]
  );
  if (hit) return true;

  const fallbackParams = [...categoryParams, mod, ...hidden.params];
  let fallbackSql = `
    SELECT r.payload ${RECORD_JOINS}
    WHERE 1 = 1${clause} AND s.module_code = ?${hidden.clause}
    LIMIT 300
  `;
  const sample = queryAll(fallbackSql, fallbackParams);
  return sample.some((row) => payloadMatchesKeyword(parsePayload(row.payload), q, mode));
}

export function getDatasetStats() {
  if (!tableExists('data_records')) {
    return { records: 0, datasets: 0, subtypes: 0 };
  }
  return {
    records: Number(queryOne('SELECT COUNT(*) AS c FROM data_records')?.c || 0),
    datasets: Number(queryOne('SELECT COUNT(*) AS c FROM datasets')?.c || 0),
    subtypes: Number(queryOne('SELECT COUNT(*) AS c FROM subtypes')?.c || 0),
  };
}
