/**
 * 1104 表样入口：用隐藏子类「表样目录」（Excel 配置类）做目录页。
 * 目录尚未导入时，用已导入表样生成可点表号的目录。
 * 有关键词时按表样检索命中的表号过滤目录行。
 */
import { listFieldMappings, listSubtypeVersions, listSubtypes } from './dataset-config.js';
import { searchDatasetRecords } from './dataset-search.js';
import { listFormTemplates } from './form-template-import.js';
import { searchFormTemplates } from './form-template-search.js';
import { getCategoryLabel } from '../config/material-categories.js';
import {
  FORM_TEMPLATE_CATALOG_ENTRY_MODULES,
  FORM_TEMPLATE_CATALOG_SUBTYPE_NAME,
} from '../config/query-hidden-subtypes.js';
import {
  formTemplateReportCodesMatch,
  normalizeFormTemplateReportCode,
} from '../utils/form-template-report-code.js';
import { compareVersionLabelsDesc } from '../utils/version-sort.js';

const SYNTHETIC_MAPPING_KEY = '__form_template_catalog';
const SYNTHETIC_FIELD_MAP = {
  table_no: '表号',
  table_name: '表名',
  version: '版本',
};
const SYNTHETIC_COLUMNS = ['表号', '表名', '版本'];

export function findFormTemplateCatalogSubtype(moduleCode) {
  const mod = String(moduleCode ?? '').trim();
  if (!mod || !FORM_TEMPLATE_CATALOG_ENTRY_MODULES.has(mod)) return null;
  return (
    listSubtypes().find(
      (st) =>
        st.moduleCode === mod &&
        st.storageKind === 'excel' &&
        String(st.name || '').trim() === FORM_TEMPLATE_CATALOG_SUBTYPE_NAME
    ) || null
  );
}

function resolveCatalogReportCodeMapping(subtypeCode) {
  const versions = listSubtypeVersions(subtypeCode);
  const mappings = versions.flatMap((v) => listFieldMappings(v.id));
  const byName = mappings.find((m) => String(m.originalColumn || '').includes('表号'));
  if (byName) return byName;
  return (
    mappings.find((m) => m.standardField === 'table_no') ||
    mappings.find((m) => m.standardField === 'table_code') ||
    null
  );
}

function catalogRowReportCode(payload, standardField) {
  if (!standardField) return '';
  return String(payload?.[standardField] ?? '').trim();
}

function countReportItems(reports) {
  let n = 0;
  for (const report of reports || []) {
    for (const block of report.blocks || []) {
      n += (block.items || []).length;
    }
  }
  return n;
}

function collectFormTemplateHitCodes(moduleCode, keyword, formTemplateSubtypeCode) {
  const q = String(keyword ?? '').trim();
  if (!q) return null;
  const hits = searchFormTemplates(q, {
    moduleCode,
    subtypeCode: formTemplateSubtypeCode || undefined,
    maxTemplates: 10000,
  });
  return new Set(
    (hits.items || []).map((item) => String(item.reportCode || '').trim()).filter(Boolean)
  );
}

function filterReportsByHitCodes(reports, standardField, hitCodes) {
  if (!hitCodes) return reports;
  return reports
    .map((report) => {
      const blocks = (report.blocks || [])
        .map((block) => {
          const items = (block.items || []).filter((item) => {
            const code = catalogRowReportCode(item.payload, standardField);
            return [...hitCodes].some((hit) => formTemplateReportCodesMatch(code, hit));
          });
          return { ...block, items };
        })
        .filter((block) => block.items.length);
      const hitCount = blocks.reduce((sum, block) => sum + block.items.length, 0);
      return { ...report, blocks, hitCount };
    })
    .filter((report) => report.hitCount > 0);
}

function attachFormTemplateLinkFields(reports, standardField) {
  if (!standardField) return reports;
  for (const report of reports) {
    for (const block of report.blocks || []) {
      for (const item of block.items || []) {
        item.payload = {
          ...(item.payload || {}),
          __form_template_link_fields: [standardField],
        };
      }
    }
  }
  return reports;
}

function syntheticFieldMeta() {
  return {
    fieldLabels: { ...SYNTHETIC_FIELD_MAP },
    fieldMappingsByVersion: { [SYNTHETIC_MAPPING_KEY]: { ...SYNTHETIC_FIELD_MAP } },
    fieldMappingOrdersByVersion: { [SYNTHETIC_MAPPING_KEY]: [...SYNTHETIC_COLUMNS] },
    fieldMappingDefaultDisplayByVersion: { [SYNTHETIC_MAPPING_KEY]: [...SYNTHETIC_COLUMNS] },
    fieldMappingDefaultFilterByVersion: { [SYNTHETIC_MAPPING_KEY]: ['版本'] },
    fieldMappingAggregateDisplayByVersion: { [SYNTHETIC_MAPPING_KEY]: [] },
  };
}

function pickLatestByNormalizedReportCode(items) {
  const byCode = new Map();
  for (const item of items || []) {
    const raw = String(item.reportCode || '').trim();
    const key = normalizeFormTemplateReportCode(raw) || raw.toUpperCase();
    if (!key) continue;
    const prev = byCode.get(key);
    if (!prev || compareVersionLabelsDesc(item.versionLabel, prev.versionLabel) < 0) {
      byCode.set(key, item);
    }
  }
  return [...byCode.values()].sort((a, b) =>
    String(a.reportCode || '').localeCompare(String(b.reportCode || ''), 'zh-CN', { numeric: true })
  );
}

function buildSyntheticCatalogReports({ moduleCode, keyword, formTemplateSubtypeCode, catalogSubtypeCode }) {
  let items = pickLatestByNormalizedReportCode(
    listFormTemplates({
      moduleCode,
      subtypeCode: formTemplateSubtypeCode || undefined,
    })
  );
  const hitCodes = collectFormTemplateHitCodes(moduleCode, keyword, formTemplateSubtypeCode);
  if (hitCodes) {
    items = items.filter((item) =>
      [...hitCodes].some((hit) => formTemplateReportCodesMatch(item.reportCode, hit))
    );
  }

  const rows = items.map((item, index) => ({
    dataItemName: item.reportTitle || item.reportCode,
    version: item.versionLabel || '',
    subtype: FORM_TEMPLATE_CATALOG_SUBTYPE_NAME,
    subtypeVersionId: SYNTHETIC_MAPPING_KEY,
    rowNum: index + 1,
    sheetName: '目录',
    category: 'norm',
    categoryLabel: getCategoryLabel('norm'),
    moduleCode,
    payload: {
      table_no: item.reportCode,
      table_name: item.reportTitle || '',
      version: item.versionLabel || '',
      __form_template_link_fields: ['table_no'],
    },
    fields: [
      { key: 'table_no', value: String(item.reportCode || '') },
      { key: 'table_name', value: String(item.reportTitle || '') },
      { key: 'version', value: String(item.versionLabel || '') },
    ],
  }));

  return [
    {
      code: catalogSubtypeCode || SYNTHETIC_MAPPING_KEY,
      name: FORM_TEMPLATE_CATALOG_SUBTYPE_NAME,
      moduleCode,
      moduleName: moduleCode,
      category: 'norm',
      categoryLabel: getCategoryLabel('norm'),
      layout: 'dataset',
      hitCount: rows.length,
      blocks: [
        {
          blockKey: '目录',
          tableName: '目录',
          versionLabel: '',
          items: rows,
        },
      ],
    },
  ];
}

function emptyExcelFieldMeta() {
  return {
    fieldLabels: {},
    fieldMappingsByVersion: {},
    fieldMappingOrdersByVersion: {},
    fieldMappingDefaultDisplayByVersion: {},
    fieldMappingDefaultFilterByVersion: {},
    fieldMappingAggregateDisplayByVersion: {},
  };
}

/**
 * @returns {{ found: false } | {
 *   found: true,
 *   keyword: string,
 *   moduleCode: string,
 *   catalogSubtypeCode: string,
 *   reportCodeColumn: string,
 *   reports: object[],
 *   fieldLabels?: object,
 *   fieldMappingsByVersion?: object,
 *   fieldMappingOrdersByVersion?: object,
 *   fieldMappingDefaultDisplayByVersion?: object,
 *   fieldMappingDefaultFilterByVersion?: object,
 *   fieldMappingAggregateDisplayByVersion?: object,
 * }}
 */
export function browseFormTemplateCatalog({ moduleCode, keyword, formTemplateSubtypeCode } = {}) {
  const mod = String(moduleCode ?? '').trim();
  const q = String(keyword ?? '').trim();
  if (!mod || !FORM_TEMPLATE_CATALOG_ENTRY_MODULES.has(mod)) return { found: false };

  const catalogSt = findFormTemplateCatalogSubtype(mod);
  const mapping = catalogSt ? resolveCatalogReportCodeMapping(catalogSt.code) : null;
  const standardField = mapping?.standardField || '';
  let reports = [];
  let fieldMeta = emptyExcelFieldMeta();

  if (catalogSt) {
    const excelResult = searchDatasetRecords('', {
      mode: 'aggregate',
      moduleCode: mod,
      subtypeCode: catalogSt.code,
    });
    reports = excelResult.reports || [];
    fieldMeta = {
      fieldLabels: excelResult.fieldLabels || {},
      fieldMappingsByVersion: excelResult.fieldMappingsByVersion || {},
      fieldMappingOrdersByVersion: excelResult.fieldMappingOrdersByVersion || {},
      fieldMappingDefaultDisplayByVersion: excelResult.fieldMappingDefaultDisplayByVersion || {},
      fieldMappingDefaultFilterByVersion: excelResult.fieldMappingDefaultFilterByVersion || {},
      fieldMappingAggregateDisplayByVersion: excelResult.fieldMappingAggregateDisplayByVersion || {},
    };
    if (q && standardField) {
      reports = filterReportsByHitCodes(
        reports,
        standardField,
        collectFormTemplateHitCodes(mod, q, formTemplateSubtypeCode)
      );
    }
    reports = attachFormTemplateLinkFields(reports, standardField);
  }

  if (!countReportItems(reports)) {
    reports = buildSyntheticCatalogReports({
      moduleCode: mod,
      keyword: q,
      formTemplateSubtypeCode,
      catalogSubtypeCode: catalogSt?.code || '',
    });
    fieldMeta = syntheticFieldMeta();
  }

  return {
    found: true,
    keyword: q,
    moduleCode: mod,
    catalogSubtypeCode: catalogSt?.code || '',
    reportCodeColumn: mapping?.originalColumn || '表号',
    reports,
    ...fieldMeta,
  };
}
