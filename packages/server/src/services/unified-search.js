/**
 * 统一检索：模块 + 标签 + 关键词，联邦查询 Excel / 表样 / 说明 / 脚本 / 码值
 */
import { queryAll } from '../db/database.js';
import { getCategoryLabel, parseCategoryFilter } from '../config/material-categories.js';
import { getStorageKindLabel } from '../config/system-subtypes.js';
import {
  resolveSearchMode,
  searchDatasetRecords,
  suggestDatasetItems,
} from './dataset-search.js';
import { searchFormTemplates } from './form-template-search.js';
import { searchDocuments } from './document-search.js';
import { sortByRelevance } from './relevance.js';
import { listModules, getSubtype } from './dataset-config.js';
import { buildAggregateBrowseIndex } from './aggregate-browse.js';

const STORAGE_KIND_CATEGORIES = {
  form_template: ['norm'],
  document: ['norm'],
  script: ['composite'],
  code_value: ['code_value'],
};

function normalizeModuleCode(value) {
  const code = String(value ?? '').trim();
  return code || '';
}

function resolveCategoryList(mode, categories) {
  const resolved = resolveSearchMode(mode);
  if (resolved === 'norm') return ['norm'];
  if (resolved === 'qa') return ['qa'];
  return parseCategoryFilter(categories);
}

const NON_EXCEL_CATEGORIES = new Set(['composite', 'code_value']);

function shouldSearchStorageKind(categoryList, kind) {
  if (kind === 'excel') {
    if (!categoryList.length) return true;
    return categoryList.some((c) => c === 'composite' || !NON_EXCEL_CATEGORIES.has(c));
  }
  const allowed = STORAGE_KIND_CATEGORIES[kind];
  if (!allowed) return false;
  if (!categoryList.length) return true;
  return allowed.some((c) => categoryList.includes(c));
}

function moduleLabel(code) {
  return listModules().find((m) => m.code === code)?.name || code;
}

function likeKeyword(keyword) {
  return `%${String(keyword).toLowerCase()}%`;
}

function buildMaterialReport({
  code,
  name,
  moduleCode,
  category,
  layout,
  blocks,
}) {
  const hitCount = blocks.reduce((sum, b) => sum + (b.items?.length || 0), 0);
  return {
    code,
    name,
    moduleCode,
    moduleName: moduleLabel(moduleCode),
    category,
    categoryLabel: getCategoryLabel(category),
    layout,
    layoutLabel: getStorageKindLabel(layout),
    hitCount,
    blocks,
  };
}

function searchFormTemplateReports(keyword, { moduleCode, subtypeCode } = {}) {
  const result = searchFormTemplates(keyword, {
    moduleCode: moduleCode || undefined,
    subtypeCode: subtypeCode || undefined,
    maxTemplates: 30,
  });
  if (!result.items.length) return [];

  const bySubtype = new Map();
  for (const item of result.items) {
    const stCode = String(item.subtypeCode || '').trim();
    if (!stCode) continue;
    const st = getSubtype(stCode);
    if (!st?.enabled || st.storageKind !== 'form_template') continue;
    if (!bySubtype.has(stCode)) bySubtype.set(stCode, { st, items: [] });
    bySubtype.get(stCode).items.push(item);
  }
  if (!bySubtype.size) return [];

  const reports = [];
  for (const [stCode, { st, items }] of bySubtype) {
    const blocks = items.map((item) => ({
      blockKey: `${item.reportCode}_${item.versionLabel}`,
      tableName: `${item.reportCode} / ${item.versionLabel}`,
      versionLabel: item.versionLabel,
      items: [
        {
          dataItemName: item.reportTitle || item.reportCode,
          snippet: `${item.hitCount} 处命中 · Sheet ${item.sheetName}`,
          moduleCode: item.moduleCode,
          moduleName: moduleLabel(item.moduleCode),
          category: 'norm',
          categoryLabel: '规范',
          entityKind: 'form_template',
          entityId: item.id,
          linkPath: `/form-templates/${item.id}`,
          payload: {
            report_code: item.reportCode,
            version: item.versionLabel,
            hit_count: item.hitCount,
          },
          fields: [
            { key: '表号', value: item.reportCode },
            { key: '版本', value: item.versionLabel },
            { key: '命中数', value: String(item.hitCount) },
          ],
        },
      ],
    }));

    reports.push(
      buildMaterialReport({
        code: stCode,
        name: st.name,
        moduleCode: st.moduleCode,
        category: st.category || 'norm',
        layout: 'form_template',
        blocks,
      })
    );
  }
  return reports;
}

function searchDocumentReports(keyword, { moduleCode, subtypeCode } = {}) {
  const result = searchDocuments(keyword, {
    maxDocuments: 30,
    subtypeCode: subtypeCode || undefined,
  });
  if (!result.items.length) return [];

  let items = result.items;
  if (moduleCode) {
    const allowed = new Set(
      queryAll(`SELECT id FROM documents WHERE module_code = ?`, [moduleCode]).map((r) =>
        Number(r.id)
      )
    );
    items = items.filter((doc) => allowed.has(doc.id));
  }
  if (!items.length) return [];

  const blocks = items.map((item) => ({
    blockKey: item.docCode,
    tableName: item.docCode,
    versionLabel: '',
    items: [
      {
        dataItemName: item.docTitle || item.docCode,
        snippet: `${item.hitCount} 处命中 · ${item.nodeCount} 个节点`,
        moduleCode: moduleCode || '1104',
        moduleName: moduleLabel(moduleCode || '1104'),
        category: 'norm',
        categoryLabel: '规范',
        entityKind: 'document',
        entityId: item.id,
        linkPath: `/documents/${item.id}`,
        payload: {
          doc_code: item.docCode,
          hit_count: item.hitCount,
        },
        fields: [
          { key: '文档代号', value: item.docCode },
          { key: '命中数', value: String(item.hitCount) },
        ],
      },
    ],
  }));

  const mod = moduleCode || '1104';
  return [
    buildMaterialReport({
      code: `${mod}_FILL_INSTRUCTION`,
      name: '填报说明',
      moduleCode: mod,
      category: 'norm',
      layout: 'document',
      blocks,
    }),
  ];
}

function searchScriptReports(keyword, { moduleCode, subtypeCode } = {}) {
  const like = likeKeyword(keyword);
  const params = [like, like, like];
  let sql = `
    SELECT id, module_code, report_code, version_label, source_file_name
    FROM conversion_scripts
    WHERE (
      LOWER(script_text) LIKE ? OR LOWER(report_code) LIKE ? OR LOWER(source_file_name) LIKE ?
    )
  `;
  if (moduleCode) {
    sql += ' AND module_code = ?';
    params.push(moduleCode);
  }
  if (subtypeCode) {
    sql += ' AND subtype_code = ?';
    params.push(subtypeCode);
  }
  sql += ' ORDER BY report_code, version_label LIMIT 40';

  const rows = queryAll(sql, params);
  if (!rows.length) return [];

  const blocks = rows.map((row) => ({
    blockKey: `${row.report_code}_${row.version_label}`,
    tableName: `${row.report_code} / ${row.version_label}`,
    versionLabel: row.version_label,
    items: [
      {
        dataItemName: row.source_file_name,
        snippet: `表号 ${row.report_code} · 版本 ${row.version_label}`,
        moduleCode: row.module_code,
        moduleName: moduleLabel(row.module_code),
        category: 'composite',
        categoryLabel: getCategoryLabel('composite'),
        entityKind: 'script',
        entityId: Number(row.id),
        linkPath: `/conversion-scripts/${row.id}`,
        payload: {
          report_code: row.report_code,
          version: row.version_label,
        },
        fields: [
          { key: '表号', value: row.report_code },
          { key: '文件名', value: row.source_file_name },
        ],
      },
    ],
  }));

  const mod = moduleCode || rows[0]?.module_code || 'YBT';
  return [
    buildMaterialReport({
      code: 'CONVERSION_SCRIPT',
      name: '转1104 脚本',
      moduleCode: mod,
      category: 'composite',
      layout: 'script',
      blocks,
    }),
  ];
}

function searchCodeValueReports(keyword, { moduleCode, subtypeCode } = {}) {
  const like = likeKeyword(keyword);
  const params = [like, like, like];
  let sql = `
    SELECT module_code, dict_name, code, meaning
    FROM module_code_values
    WHERE (
      LOWER(dict_name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(meaning) LIKE ?
    )
  `;
  if (moduleCode) {
    sql += ' AND module_code = ?';
    params.push(moduleCode);
  }
  if (subtypeCode) {
    sql += ' AND subtype_code = ?';
    params.push(subtypeCode);
  }
  sql += ' ORDER BY module_code, dict_name, code LIMIT 80';

  const rows = queryAll(sql, params);
  if (!rows.length) return [];

  const byModule = new Map();
  for (const row of rows) {
    const mod = row.module_code;
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push(row);
  }

  const reports = [];
  for (const [mod, modRows] of byModule) {
    const byDict = new Map();
    for (const row of modRows) {
      if (!byDict.has(row.dict_name)) byDict.set(row.dict_name, []);
      byDict.get(row.dict_name).push(row);
    }

    const blocks = [...byDict.entries()].map(([dictName, dictRows]) => ({
      blockKey: dictName,
      tableName: dictName,
      versionLabel: '',
      items: dictRows.map((row) => ({
        dataItemName: `${row.code} — ${row.meaning || ''}`.trim(),
        snippet: row.meaning || row.code,
        moduleCode: mod,
        moduleName: moduleLabel(mod),
        category: 'code_value',
        categoryLabel: getCategoryLabel('code_value'),
        entityKind: 'code_value',
        payload: {
          dict_name: row.dict_name,
          code: row.code,
          meaning: row.meaning || '',
        },
        fields: [
          { key: '码表', value: row.dict_name },
          { key: '码值', value: row.code },
          { key: '含义', value: row.meaning || '' },
        ],
      })),
    }));

    reports.push(
      buildMaterialReport({
        code: `${mod}_CODE_VALUE`,
        name: `${moduleLabel(mod)}码值`,
        moduleCode: mod,
        category: 'code_value',
        layout: 'code_value',
        blocks,
      })
    );
  }
  return reports;
}

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

function mergeFieldMeta(target, source) {
  if (!source) return target;
  return {
    fieldLabels: { ...target.fieldLabels, ...(source.fieldLabels || {}) },
    fieldMappingsByVersion: {
      ...target.fieldMappingsByVersion,
      ...(source.fieldMappingsByVersion || {}),
    },
    fieldMappingOrdersByVersion: {
      ...target.fieldMappingOrdersByVersion,
      ...(source.fieldMappingOrdersByVersion || {}),
    },
    fieldMappingDefaultDisplayByVersion: {
      ...target.fieldMappingDefaultDisplayByVersion,
      ...(source.fieldMappingDefaultDisplayByVersion || {}),
    },
    fieldMappingDefaultFilterByVersion: {
      ...target.fieldMappingDefaultFilterByVersion,
      ...(source.fieldMappingDefaultFilterByVersion || {}),
    },
    fieldMappingAggregateDisplayByVersion: {
      ...target.fieldMappingAggregateDisplayByVersion,
      ...(source.fieldMappingAggregateDisplayByVersion || {}),
    },
  };
}

function emptyFieldMeta() {
  return {
    fieldLabels: {},
    fieldMappingsByVersion: {},
    fieldMappingOrdersByVersion: {},
    fieldMappingDefaultDisplayByVersion: {},
    fieldMappingDefaultFilterByVersion: {},
    fieldMappingAggregateDisplayByVersion: {},
  };
}

function maybeAggregateBrowse(q, st, { mode, categories, moduleCode }) {
  if (q) return null;
  if (!st || st.storageKind !== 'excel' || st.category !== 'norm') return null;
  const index = buildAggregateBrowseIndex({
    subtypeCode: st.code,
    moduleCode: moduleCode || st.moduleCode,
    categories,
    mode,
  });
  if (!index?.columns?.length) return null;
  return index;
}

function searchReportsForSubtype(q, st, { mode, categories, versionId, moduleCode }) {
  const mod = moduleCode || st.moduleCode;
  const opts = { moduleCode: mod, subtypeCode: st.code };
  let fieldMeta = emptyFieldMeta();
  const reports = [];

  if (st.storageKind === 'excel') {
    const excelResult = searchDatasetRecords(q, {
      mode,
      categories,
      versionId,
      moduleCode: mod,
      subtypeCode: st.code,
    });
    if (excelResult.error) return excelResult;
    reports.push(...(excelResult.reports || []));
    fieldMeta = {
      fieldLabels: excelResult.fieldLabels || {},
      fieldMappingsByVersion: excelResult.fieldMappingsByVersion || {},
      fieldMappingOrdersByVersion: excelResult.fieldMappingOrdersByVersion || {},
      fieldMappingDefaultDisplayByVersion: excelResult.fieldMappingDefaultDisplayByVersion || {},
      fieldMappingDefaultFilterByVersion: excelResult.fieldMappingDefaultFilterByVersion || {},
      fieldMappingAggregateDisplayByVersion: excelResult.fieldMappingAggregateDisplayByVersion || {},
    };
  } else if (st.storageKind === 'form_template') {
    reports.push(...searchFormTemplateReports(q, opts));
  } else if (st.storageKind === 'document') {
    reports.push(...searchDocumentReports(q, opts));
  } else if (st.storageKind === 'script') {
    reports.push(...searchScriptReports(q, opts));
  } else if (st.storageKind === 'code_value') {
    reports.push(...searchCodeValueReports(q, opts));
  }

  return {
    reports,
    aggregateBrowse: maybeAggregateBrowse(q, st, { mode, categories, moduleCode: mod }),
    ...fieldMeta,
  };
}

export function unifiedSearch(keyword, { mode, categories, moduleCode, versionId, subtypeCode } = {}) {
  const q = String(keyword ?? '').trim();

  const categoryList = resolveCategoryList(mode, categories);
  const mod = normalizeModuleCode(moduleCode);
  const subtypeList = parseSubtypeFilter(subtypeCode);

  if (subtypeList.length) {
    const reports = [];
    let fieldMeta = emptyFieldMeta();
    let aggregateBrowse = null;
    for (const code of subtypeList) {
      const st = getSubtype(code);
      if (!st || !st.enabled || (mod && st.moduleCode !== mod)) continue;
      const scoped = searchReportsForSubtype(q, st, {
        mode,
        categories: categoryList,
        versionId,
        moduleCode: mod || st.moduleCode,
      });
      if (scoped.error) return scoped;
      reports.push(...scoped.reports);
      fieldMeta = mergeFieldMeta(fieldMeta, scoped);
      if (subtypeList.length === 1) {
        aggregateBrowse = scoped.aggregateBrowse ?? null;
      }
    }
    return {
      keyword: q,
      mode: resolveSearchMode(mode),
      moduleCode: mod || null,
      subtypeCodes: subtypeList,
      reports,
      aggregateBrowse,
      ...fieldMeta,
    };
  }

  const reports = [];
  let fieldMeta = emptyFieldMeta();

  if (shouldSearchStorageKind(categoryList, 'excel')) {
    const excelResult = searchDatasetRecords(q, {
      mode,
      categories: categoryList,
      versionId,
      moduleCode: mod || undefined,
    });
    if (excelResult.error) return excelResult;
    reports.push(...(excelResult.reports || []));
    fieldMeta = {
      fieldLabels: excelResult.fieldLabels || {},
      fieldMappingsByVersion: excelResult.fieldMappingsByVersion || {},
      fieldMappingOrdersByVersion: excelResult.fieldMappingOrdersByVersion || {},
      fieldMappingDefaultDisplayByVersion: excelResult.fieldMappingDefaultDisplayByVersion || {},
      fieldMappingDefaultFilterByVersion: excelResult.fieldMappingDefaultFilterByVersion || {},
      fieldMappingAggregateDisplayByVersion: excelResult.fieldMappingAggregateDisplayByVersion || {},
    };
  }

  if (shouldSearchStorageKind(categoryList, 'form_template')) {
    reports.push(...searchFormTemplateReports(q, { moduleCode: mod || undefined }));
  }
  if (shouldSearchStorageKind(categoryList, 'document')) {
    reports.push(...searchDocumentReports(q, { moduleCode: mod || undefined }));
  }
  if (shouldSearchStorageKind(categoryList, 'script')) {
    reports.push(...searchScriptReports(q, { moduleCode: mod || undefined }));
  }
  if (shouldSearchStorageKind(categoryList, 'code_value')) {
    reports.push(...searchCodeValueReports(q, { moduleCode: mod || undefined }));
  }

  const finalReports = mod
    ? reports.filter((r) => (r.moduleCode || '') === mod)
    : reports;

  return {
    keyword: q,
    mode: resolveSearchMode(mode),
    moduleCode: mod || null,
    reports: finalReports,
    ...fieldMeta,
  };
}

function materialSuggestItems(keyword, { moduleCode, categoryList, limit, subtypeCode } = {}) {
  const q = String(keyword).trim();
  const items = [];
  const mod = normalizeModuleCode(moduleCode);
  const opts = { moduleCode: mod || undefined, subtypeCode: subtypeCode || undefined };

  if (shouldSearchStorageKind(categoryList, 'form_template')) {
    for (const report of searchFormTemplateReports(q, opts)) {
      for (const block of report.blocks) {
        for (const item of block.items) {
          items.push({
            dataItemName: item.dataItemName,
            tableName: `${report.name} / ${block.tableName}`,
            reportCode: report.code,
            reportName: report.name,
            category: report.category,
            categoryLabel: report.categoryLabel,
            moduleCode: report.moduleCode,
            moduleName: report.moduleName,
            sourceKind: report.layout,
          });
        }
      }
    }
  }

  if (shouldSearchStorageKind(categoryList, 'document')) {
    for (const report of searchDocumentReports(q, opts)) {
      for (const block of report.blocks) {
        for (const item of block.items) {
          items.push({
            dataItemName: item.dataItemName,
            tableName: `${report.name} / ${block.tableName}`,
            reportCode: report.code,
            reportName: report.name,
            category: report.category,
            categoryLabel: report.categoryLabel,
            moduleCode: report.moduleCode,
            moduleName: report.moduleName,
            sourceKind: report.layout,
          });
        }
      }
    }
  }

  if (shouldSearchStorageKind(categoryList, 'script')) {
    for (const report of searchScriptReports(q, opts)) {
      for (const block of report.blocks) {
        for (const item of block.items) {
          items.push({
            dataItemName: item.dataItemName,
            tableName: `${report.name} / ${block.tableName}`,
            reportCode: report.code,
            reportName: report.name,
            category: report.category,
            categoryLabel: report.categoryLabel,
            moduleCode: report.moduleCode,
            moduleName: report.moduleName,
            sourceKind: report.layout,
          });
        }
      }
    }
  }

  if (shouldSearchStorageKind(categoryList, 'code_value')) {
    for (const report of searchCodeValueReports(q, opts)) {
      for (const block of report.blocks) {
        for (const item of block.items.slice(0, 5)) {
          items.push({
            dataItemName: item.dataItemName,
            tableName: `${report.name} / ${block.tableName}`,
            reportCode: report.code,
            reportName: report.name,
            category: report.category,
            categoryLabel: report.categoryLabel,
            moduleCode: report.moduleCode,
            moduleName: report.moduleName,
            sourceKind: report.layout,
          });
        }
      }
    }
  }

  return sortByRelevance(items, q, 'dataItemName').slice(0, limit);
}

export function unifiedSuggest(keyword, options = {}) {
  const limit = Number(options.limit ?? 10);
  const q = String(keyword ?? '').trim();
  if (!q) return { items: [] };

  const categoryList = resolveCategoryList(options.mode, options.categories);
  const mod = normalizeModuleCode(options.moduleCode);
  const subtypeList = parseSubtypeFilter(options.subtypeCode);

  if (subtypeList.length) {
    let items = [];
    for (const code of subtypeList) {
      const st = getSubtype(code);
      if (!st || !st.enabled || (mod && st.moduleCode !== mod)) continue;
      if (st.storageKind === 'excel') {
        items.push(
          ...suggestDatasetItems(q, {
            limit,
            mode: options.mode,
            categories: categoryList,
            moduleCode: mod || st.moduleCode,
            subtypeCode: st.code,
          }).items
        );
      } else {
        items.push(
          ...materialSuggestItems(q, {
            moduleCode: mod || st.moduleCode,
            categoryList,
            limit,
            subtypeCode: st.code,
          })
        );
      }
    }
    return {
      items: sortByRelevance(items, q, 'dataItemName')
        .slice(0, limit)
        .map((item) => ({
          ...item,
          categoryLabel: item.categoryLabel || getCategoryLabel(item.category || 'norm'),
        })),
    };
  }

  const excelItems =
    shouldSearchStorageKind(categoryList, 'excel')
      ? suggestDatasetItems(q, {
          limit,
          mode: options.mode,
          categories: categoryList,
          moduleCode: mod || undefined,
          subtypeCode: options.subtypeCode,
        }).items
      : [];

  const materialItems = materialSuggestItems(q, {
    moduleCode: mod,
    categoryList,
    limit,
    subtypeCode: options.subtypeCode,
  });

  const merged = sortByRelevance([...excelItems, ...materialItems], q, 'dataItemName')
    .slice(0, limit)
    .map((item) => ({
      ...item,
      categoryLabel: item.categoryLabel || getCategoryLabel(item.category || 'norm'),
    }));

  return { items: merged };
}
