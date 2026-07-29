/**
 * 1104 表样搜索（两阶段：cells 索引表 + 表样名称/表号，不解析 matrix_json）
 */
import { queryAll, queryOne } from '../db/database.js';
import { cellText } from './form-template-search-scope.js';
import { inferFormTemplateModule } from '../config/form-template-catalog.js';

const DEFAULT_HITS_PER_TEMPLATE = 30;
const DEFAULT_MAX_TEMPLATES = 50;

function matchesKeywordSql(keyword) {
  return `%${String(keyword).toLowerCase()}%`;
}

function matchesKeyword(text, keyword) {
  if (!text) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function snippet(text, keyword, maxLen = 80) {
  const s = cellText(text);
  if (!s) return '';
  const lower = s.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx < 0) return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…`;
  const pad = Math.max(0, Math.floor((maxLen - keyword.length) / 2));
  const start = Math.max(0, idx - pad);
  const end = Math.min(s.length, start + maxLen);
  let part = s.slice(start, end);
  if (start > 0) part = `…${part}`;
  if (end < s.length) part = `${part}…`;
  return part;
}

function mapHitRow(row, keyword) {
  const r = Number(row.row_index);
  const c = Number(row.col_index);
  const text = row.cell_text;
  return {
    row: r,
    col: c,
    rowNum: r + 1,
    colNum: c + 1,
    text,
    cellKind: row.cell_kind || 'header',
    snippet: snippet(text, keyword),
  };
}

function buildTemplateMetaHits(template, keyword) {
  if (!template) return [];

  const hits = [];
  const title = template.report_title || '';
  const code = template.report_code || '';

  if (matchesKeyword(title, keyword)) {
    hits.push({
      row: null,
      col: null,
      rowNum: null,
      colNum: null,
      text: title,
      cellKind: 'template_title',
      snippet: snippet(title, keyword),
    });
  }

  if (code && matchesKeyword(code, keyword) && code.toLowerCase() !== title.toLowerCase()) {
    hits.push({
      row: null,
      col: null,
      rowNum: null,
      colNum: null,
      text: code,
      cellKind: 'template_code',
      snippet: snippet(code, keyword),
    });
  }

  return hits;
}

function countTemplateMetaHits(template, keyword) {
  return buildTemplateMetaHits(template, keyword).length;
}

function normalizeFilterText(value) {
  return String(value ?? '').trim();
}

function matchesTemplateFilters(template, filters = {}) {
  const moduleCode = normalizeFilterText(filters.moduleCode);
  const reportQuery = normalizeFilterText(filters.reportQuery).toLowerCase();
  const subtypeCode = normalizeFilterText(filters.subtypeCode);

  if (moduleCode) {
    const mod = template.module_code || inferFormTemplateModule(template.report_code);
    if (mod !== moduleCode) return false;
  }

  if (subtypeCode && String(template.subtype_code || '') !== subtypeCode) {
    return false;
  }

  if (reportQuery) {
    const code = String(template.report_code || '').toLowerCase();
    const title = String(template.report_title || '').toLowerCase();
    if (!code.includes(reportQuery) && !title.includes(reportQuery)) return false;
  }

  return true;
}

/**
 * 阶段 1：按表样聚合命中数（不含具体坐标）
 * @param {string} keyword
 * @param {{ maxTemplates?: number, moduleCode?: string, reportQuery?: string }} [options]
 */
export function searchFormTemplates(keyword, options = {}) {
  const q = String(keyword ?? '').trim();
  const maxTemplates = options.maxTemplates ?? DEFAULT_MAX_TEMPLATES;
  const filters = {
    moduleCode: options.moduleCode,
    reportQuery: options.reportQuery,
    subtypeCode: options.subtypeCode,
  };

  const templates = queryAll(
    `SELECT id, report_code, report_title, version_label, module_code, sheet_name, subtype_code
     FROM form_templates
     ORDER BY report_code, version_label`
  ).filter((template) => matchesTemplateFilters(template, filters));

  if (!q) {
    const cellHitRows = queryAll(
      `SELECT template_id, COUNT(*) AS hit_count
       FROM form_template_cells
       WHERE searchable = 1
       GROUP BY template_id`
    );
    const cellHitMap = new Map(
      cellHitRows.map((row) => [Number(row.template_id), Number(row.hit_count)])
    );

    const items = templates.slice(0, maxTemplates).map((template) => {
      const id = Number(template.id);
      const cellHits = cellHitMap.get(id) || 0;
      return {
        id,
        reportCode: template.report_code,
        reportTitle: template.report_title || '',
        versionLabel: template.version_label,
        sheetName: template.sheet_name,
        moduleCode: template.module_code || inferFormTemplateModule(template.report_code),
        hitCount: cellHits || 1,
      };
    });

    const totalHits = items.reduce((sum, item) => sum + item.hitCount, 0);
    return {
      keyword: q,
      moduleCode: normalizeFilterText(options.moduleCode) || null,
      reportQuery: normalizeFilterText(options.reportQuery) || null,
      totalTemplates: items.length,
      totalHits,
      items,
      searchScope: 'header_indicator_and_template_name',
    };
  }

  const like = matchesKeywordSql(q);

  const cellHitRows = queryAll(
    `SELECT template_id, COUNT(*) AS hit_count
     FROM form_template_cells
     WHERE searchable = 1 AND LOWER(cell_text) LIKE ?
     GROUP BY template_id`,
    [like]
  );
  const cellHitMap = new Map(
    cellHitRows.map((row) => [Number(row.template_id), Number(row.hit_count)])
  );

  const items = [];
  let totalHits = 0;

  for (const template of templates) {
    const id = Number(template.id);
    const cellHits = cellHitMap.get(id) || 0;
    const metaHits = countTemplateMetaHits(template, q);
    const hitCount = cellHits + metaHits;
    if (!hitCount) continue;

    totalHits += hitCount;
    items.push({
      id,
      reportCode: template.report_code,
      reportTitle: template.report_title || '',
      versionLabel: template.version_label,
      sheetName: template.sheet_name,
      moduleCode: template.module_code || inferFormTemplateModule(template.report_code),
      hitCount,
    });

    if (items.length >= maxTemplates) break;
  }

  return {
    keyword: q,
    moduleCode: normalizeFilterText(options.moduleCode) || null,
    reportQuery: normalizeFilterText(options.reportQuery) || null,
    totalTemplates: items.length,
    totalHits,
    items,
    truncated: items.length >= maxTemplates,
    searchScope: 'header_indicator_and_template_name',
  };
}

/**
 * 阶段 2：单表样命中明细
 * @param {number} templateId
 * @param {string} keyword
 * @param {{ hitsLimit?: number }} [options]
 */
export function getFormTemplateSearchHits(templateId, keyword, options = {}) {
  const q = String(keyword ?? '').trim();
  const id = Number(templateId);
  if (!q || !Number.isFinite(id) || id <= 0) {
    return { templateId: id, keyword: q, hitCount: 0, hits: [], hitsTruncated: false };
  }

  const hitsLimit = options.hitsLimit ?? DEFAULT_HITS_PER_TEMPLATE;
  const like = matchesKeywordSql(q);
  const template = queryOne(
    `SELECT id, report_code, report_title
     FROM form_templates
     WHERE id = ?`,
    [id]
  );

  const metaHits = buildTemplateMetaHits(template, q);
  const cellLimit = Math.max(0, hitsLimit - metaHits.length);

  const countRow = queryOne(
    `SELECT COUNT(*) AS c
     FROM form_template_cells
     WHERE template_id = ? AND searchable = 1 AND LOWER(cell_text) LIKE ?`,
    [id, like]
  );
  const cellHitCount = Number(countRow?.c || 0);
  const hitCount = cellHitCount + metaHits.length;

  const rows =
    cellLimit > 0
      ? queryAll(
          `SELECT row_index, col_index, cell_text, cell_kind
           FROM form_template_cells
           WHERE template_id = ? AND searchable = 1 AND LOWER(cell_text) LIKE ?
           ORDER BY row_index, col_index
           LIMIT ?`,
          [id, like, cellLimit]
        )
      : [];

  const hits = [...metaHits, ...rows.map((row) => mapHitRow(row, q))];

  return {
    templateId: id,
    keyword: q,
    hitCount,
    hits,
    hitsTruncated: hitCount > hitsLimit,
  };
}

/** @deprecated 兼容旧调用名，行为同 searchFormTemplates */
export const searchFormTemplateCells = searchFormTemplates;
