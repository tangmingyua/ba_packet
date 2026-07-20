/**
 * 新模型搜索 / 联想（data_records）
 * 按模式限定搜索字段：规范=表名+数据项+填报规范；答疑=表名+数据项+问题描述
 */
import { queryAll, queryOne } from '../db/database.js';
import { sortByRelevance } from './relevance.js';
import { listFieldMappings, listStandardFields } from './dataset-config.js';
import {
  buildSearchMatchParams,
  buildSearchMatchSql,
  payloadMatchesKeyword,
} from './search-fields.js';
import {
  getCategoryLabel,
  parseCategoryFilter,
} from '../config/material-categories.js';

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
    const selected = parseCategoryFilter(categories);
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

function queryMatchingRows({ keyword, mode, versionId, distinct = false, categories }) {
  const q = String(keyword ?? '').trim();
  const matchSql = buildSearchMatchSql(mode);
  const matchParams = buildSearchMatchParams(q, mode);
  const { clause, params: categoryParams } = categoryFilterClause(mode, categories);

  const params = [...matchParams, ...categoryParams];
  const select = distinct
    ? `SELECT DISTINCT r.std_data_item, r.std_subtype, r.std_version,
           COALESCE(r.std_category, s.category, 'norm') AS record_category,
           s.name AS subtype_name, s.code AS subtype_code,
           s.module_code, m.name AS module_name`
    : `SELECT ${RECORD_SELECT}`;

  let sql = `
    ${select}
    ${RECORD_JOINS}
    WHERE ${matchSql}${clause}
  `;

  if (versionId) {
    sql += ' AND r.subtype_version_id = ?';
    params.push(Number(versionId));
  }

  if (distinct) {
    sql += ' ORDER BY r.std_data_item';
  } else {
    sql += ' ORDER BY m.sort_order, s.sort_order, sv.id, r.std_data_item';
  }

  let rows = queryAll(sql, params);

  if (!rows.length && !distinct) {
    const fallbackParams = [...categoryParams];
    let fallbackSql = `
      SELECT ${RECORD_SELECT}
      ${RECORD_JOINS}
      WHERE 1 = 1${clause}
    `;
    if (versionId) {
      fallbackSql += ' AND r.subtype_version_id = ?';
      fallbackParams.push(Number(versionId));
    }
    fallbackSql += ' ORDER BY m.sort_order, s.sort_order, sv.id';

    const all = queryAll(fallbackSql, fallbackParams);
    rows = all.filter((row) => payloadMatchesKeyword(parsePayload(row.payload), q, mode));
  }

  return rows;
}

/** 联想：在模式限定字段内匹配，返回数据项名称 */
export function suggestDatasetItems(keyword, options = {}) {
  const limit = typeof options === 'number' ? options : Number(options.limit ?? 10);
  const mode = typeof options === 'object' ? options.mode : undefined;
  const q = String(keyword ?? '').trim();
  if (!q) return { items: [] };
  if (!tableExists('data_records')) return { items: [] };

  const rows = queryMatchingRows({ keyword: q, mode, distinct: true, categories: options.categories });

  const merged = rows.map((row) => ({
    data_item_name: row.std_data_item,
    tableName: `${row.subtype_name || row.std_subtype} / ${row.std_version}`,
    reportCode: row.subtype_code,
    reportName: row.subtype_name || row.std_subtype,
    category: row.record_category || 'norm',
    moduleCode: row.module_code || 'YBT',
    moduleName: row.module_name || row.module_code || '一表通',
  }));

  const items = sortByRelevance(merged, q)
    .slice(0, limit)
    .map((row) => ({
      dataItemName: row.data_item_name,
      tableName: row.tableName,
      reportCode: row.reportCode,
      reportName: row.reportName,
      category: row.category,
      categoryLabel: getCategoryLabel(row.category),
      moduleCode: row.moduleCode,
      moduleName: row.moduleName,
    }));

  return { items };
}

/** 搜索：按模式字段匹配，按子类分 report，按版本分 block */
export function searchDatasetRecords(keyword, { versionId, mode, categories } = {}) {
  const q = String(keyword ?? '').trim();
  if (!q) {
    return { keyword: '', reports: [], error: '请输入搜索关键词' };
  }
  if (!tableExists('data_records')) {
    return { keyword: q, reports: [] };
  }

  const rows = queryMatchingRows({ keyword: q, mode, versionId, categories });

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
      category: recordCategory,
      categoryLabel: getCategoryLabel(recordCategory),
      moduleCode: report.moduleCode,
      moduleName: report.moduleName,
      payload,
      fields: Object.entries(payload).map(([key, value]) => ({ key, value: String(value ?? '') })),
    });
  }

  const reports = [...bySubtype.values()].map((report) => {
    const blocks = [...report.blockMap.entries()].map(([blockKey, items]) => ({
      blockKey,
      tableName: blockKey,
      versionLabel: blockKey,
      tableNo: blockKey,
      items,
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

  const { fieldMappingsByVersion, fieldMappingOrdersByVersion, fieldMappingDefaultDisplayByVersion } =
    buildFieldMappingsByVersion(versionIds);
  return {
    keyword: q,
    reports,
    mode: resolveSearchMode(mode),
    fieldLabels: buildFieldLabels(fieldMappingsByVersion),
    fieldMappingsByVersion,
    fieldMappingOrdersByVersion,
    fieldMappingDefaultDisplayByVersion,
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
  };
}

function buildFieldMappingsByVersion(versionIds) {
  const fieldMappingsByVersion = {};
  const fieldMappingOrdersByVersion = {};
  const fieldMappingDefaultDisplayByVersion = {};
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
  }
  return { fieldMappingsByVersion, fieldMappingOrdersByVersion, fieldMappingDefaultDisplayByVersion };
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
