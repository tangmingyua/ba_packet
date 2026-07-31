/**
 * 按主类 + 资料标签浏览与统计（查询页卡片 + 列表）
 */
import { queryAll, queryOne } from '../db/database.js';
import { getCategoryLabel, parseCategoryFilter } from '../config/material-categories.js';
import { listSearchableCategories, listVersionRecordsView, listSubtypes } from './dataset-config.js';

function normalizeModuleCode(code) {
  const mod = String(code || '').trim();
  if (!mod) throw new Error('请选择模块（主类）');
  return mod;
}

function normalizeCategory(code) {
  const cat = String(code || '').trim();
  const allowed = new Set(listSearchableCategories().map((c) => c.code));
  if (!allowed.has(cat)) throw new Error('无效的资料标签');
  return cat;
}

function countCategoryRecords(mod, catCode) {
  if (catCode === 'to1104') {
    return Number(
      queryOne('SELECT COUNT(*) AS c FROM conversion_scripts WHERE module_code = ?', [mod])?.c || 0
    );
  }
  if (catCode === 'code_value') {
    return Number(
      queryOne('SELECT COUNT(*) AS c FROM module_code_values WHERE module_code = ?', [mod])?.c || 0
    );
  }
  const excelCount = Number(
    queryOne(
      `
      SELECT COUNT(*) AS c
      FROM data_records r
      JOIN subtype_versions sv ON sv.id = r.subtype_version_id
      JOIN subtypes s ON s.code = sv.subtype_code
      WHERE s.module_code = ? AND COALESCE(r.std_category, s.category) = ?
      `,
      [mod, catCode]
    )?.c || 0
  );
  if (catCode !== 'norm') return excelCount;
  const formCount = Number(
    queryOne(
      `
      SELECT COUNT(*) AS c
      FROM form_templates ft
      INNER JOIN subtypes s ON s.code = ft.subtype_code
        AND s.enabled = 1
        AND s.storage_kind = 'form_template'
        AND s.module_code = ft.module_code
      WHERE ft.module_code = ?
      `,
      [mod]
    )?.c || 0
  );
  const docCount = Number(
    queryOne('SELECT COUNT(*) AS c FROM documents WHERE module_code = ?', [mod])?.c || 0
  );
  return excelCount + formCount + docCount;
}

/** 各标签在该模块下的记录数（仅含库中已有资料的类型标签，与 listSearchableCategories 一致） */
export function getModuleCategoryStats(moduleCode) {
  const mod = normalizeModuleCode(moduleCode);
  const searchable = listSearchableCategories({ moduleCode: mod });

  return searchable.map((cat) => ({
    code: cat.code,
    label: cat.label,
    count: countCategoryRecords(mod, cat.code),
  }));
}

function countExcelSubtypeRecords(subtypeCode, categoryList) {
  let sql = `
    SELECT COUNT(*) AS c
    FROM data_records r
    JOIN subtype_versions sv ON sv.id = r.subtype_version_id
    JOIN subtypes s ON s.code = sv.subtype_code
    WHERE sv.subtype_code = ?
  `;
  const params = [subtypeCode];
  if (categoryList.length) {
    const placeholders = categoryList.map(() => '?').join(',');
    sql += ` AND COALESCE(r.std_category, s.category) IN (${placeholders})`;
    params.push(...categoryList);
  }
  return Number(queryOne(sql, params)?.c || 0);
}

function countSubtypeRecords(st, categoryList) {
  if (st.storageKind === 'excel') {
    return countExcelSubtypeRecords(st.code, categoryList);
  }
  const tableMap = {
    form_template: 'form_templates',
    document: 'documents',
    script: 'conversion_scripts',
    code_value: 'module_code_values',
  };
  const table = tableMap[st.storageKind];
  if (!table) return 0;
  if (st.storageKind === 'form_template') {
    return Number(
      queryOne(
        `
        SELECT COUNT(*) AS c FROM form_templates ft
        WHERE ft.subtype_code = ? AND ft.module_code = ?
          AND EXISTS (
            SELECT 1 FROM subtypes s
            WHERE s.code = ft.subtype_code AND s.enabled = 1 AND s.storage_kind = 'form_template'
          )
        `,
        [st.code, st.moduleCode]
      )?.c || 0
    );
  }
  return Number(
    queryOne(`SELECT COUNT(*) AS c FROM ${table} WHERE subtype_code = ?`, [st.code])?.c || 0
  );
}

function subtypeMatchesCategories(st, categoryList) {
  if (!categoryList.length) return true;
  if (categoryList.includes(st.category)) return true;
  if (st.storageKind === 'excel') {
    return countExcelSubtypeRecords(st.code, categoryList) > 0;
  }
  return false;
}

/** 当前模块下可选子类（有资料且匹配已选标签） */
export function getModuleSubtypeStats(moduleCode, categories) {
  const mod = normalizeModuleCode(moduleCode);
  const categoryList = parseCategoryFilter(categories);

  return listSubtypes()
    .filter((st) => st.moduleCode === mod && st.enabled)
    .filter((st) => subtypeMatchesCategories(st, categoryList))
    .map((st) => ({
      code: st.code,
      name: st.name,
      category: st.category,
      categoryLabel: getCategoryLabel(st.category),
      storageKind: st.storageKind,
      count: countSubtypeRecords(st, categoryList),
    }))
    .filter((st) => st.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function browseConversionScripts({ moduleCode, keyword, limit, offset }) {
  const mod = normalizeModuleCode(moduleCode);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const normalizedOffset = Math.max(Number(offset) || 0, 0);
  const q = String(keyword || '').trim();

  const where = ['module_code = ?'];
  const params = [mod];
  if (q) {
    where.push('(UPPER(report_code) LIKE ? OR LOWER(source_file_name) LIKE ? OR LOWER(script_text) LIKE ?)');
    const pattern = `%${q.toLowerCase()}%`;
    params.push(`%${q.toUpperCase()}%`, pattern, pattern);
  }

  const whereSql = where.join(' AND ');
  const total = Number(
    queryOne(`SELECT COUNT(*) AS c FROM conversion_scripts WHERE ${whereSql}`, params)?.c || 0
  );

  const rows = queryAll(
    `
    SELECT id, module_code, report_code, version_label, source_file_name, imported_at,
           SUBSTR(script_text, 1, 800) AS script_preview
    FROM conversion_scripts
    WHERE ${whereSql}
    ORDER BY report_code, version_label, imported_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, normalizedLimit, normalizedOffset]
  );

  return {
    layout: 'script',
    category: 'to1104',
    categoryLabel: getCategoryLabel('to1104'),
    moduleCode: mod,
    total,
    limit: normalizedLimit,
    offset: normalizedOffset,
    items: rows.map((row) => ({
      id: row.id,
      reportCode: row.report_code,
      sourceFileName: row.source_file_name,
      versionLabel: row.version_label,
      importedAt: row.imported_at,
      scriptPreview: row.script_preview || '',
    })),
  };
}

function browseCodeValues({ moduleCode, keyword, limit, offset }) {
  const mod = normalizeModuleCode(moduleCode);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const normalizedOffset = Math.max(Number(offset) || 0, 0);
  const q = String(keyword || '').trim();

  const where = ['module_code = ?'];
  const params = [mod];
  if (q) {
    where.push(
      '(dict_name LIKE ? OR code LIKE ? OR meaning LIKE ? OR extend_1 LIKE ? OR extend_2 LIKE ?)'
    );
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  const whereSql = where.join(' AND ');
  const total = Number(
    queryOne(`SELECT COUNT(*) AS c FROM module_code_values WHERE ${whereSql}`, params)?.c || 0
  );

  const rows = queryAll(
    `
    SELECT dict_name, code, meaning, extend_1, extend_2, imported_at
    FROM module_code_values
    WHERE ${whereSql}
    ORDER BY dict_name, code
    LIMIT ? OFFSET ?
    `,
    [...params, normalizedLimit, normalizedOffset]
  );

  return {
    layout: 'code_value',
    category: 'code_value',
    categoryLabel: getCategoryLabel('code_value'),
    moduleCode: mod,
    total,
    limit: normalizedLimit,
    offset: normalizedOffset,
    items: rows.map((row) => ({
      dictName: row.dict_name,
      code: row.code,
      meaning: row.meaning || '',
      extend1: row.extend_1 || '',
      extend2: row.extend_2 || '',
      importedAt: row.imported_at,
    })),
  };
}

function browseExcelCategory({ moduleCode, category, keyword, limit, offset }) {
  const mod = normalizeModuleCode(moduleCode);
  const cat = normalizeCategory(category);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const normalizedOffset = Math.max(Number(offset) || 0, 0);
  const q = String(keyword || '').trim();

  const where = ['s.module_code = ?', 'COALESCE(r.std_category, s.category) = ?'];
  const params = [mod, cat];
  if (q) {
    where.push('(r.payload LIKE ? OR r.std_data_item LIKE ? OR r.std_subtype LIKE ? OR r.std_version LIKE ?)');
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  const whereSql = where.join(' AND ');
  const total = Number(
    queryOne(
      `
      SELECT COUNT(*) AS c
      FROM data_records r
      JOIN subtype_versions sv ON sv.id = r.subtype_version_id
      JOIN subtypes s ON s.code = sv.subtype_code
      WHERE ${whereSql}
      `,
      params
    )?.c || 0
  );

  const rows = queryAll(
    `
    SELECT
      r.id, r.row_num, r.sheet_name, r.payload, r.std_data_item,
      r.subtype_version_id, sv.version_label, s.code AS subtype_code, s.name AS subtype_name
    FROM data_records r
    JOIN subtype_versions sv ON sv.id = r.subtype_version_id
    JOIN subtypes s ON s.code = sv.subtype_code
    WHERE ${whereSql}
    ORDER BY s.sort_order, s.name, sv.id, r.row_num, r.id
    LIMIT ? OFFSET ?
    `,
    [...params, normalizedLimit, normalizedOffset]
  );

  const subtypeCodes = [...new Set(rows.map((r) => r.subtype_code))];
  let columns = [{ field: '__rowNum', header: '行号', label: '行号', system: true }];
  if (subtypeCodes.length === 1) {
    const view = listVersionRecordsView({
      subtypeCode: subtypeCodes[0],
      limit: 1,
      offset: 0,
    });
    columns = view.columns;
  } else if (rows.length) {
    columns = [
      { field: '__rowNum', header: '行号', label: '行号', system: true },
      { field: '__subtype', header: '子类', label: '子类', system: true },
      { field: '__version', header: '版本', label: '版本', system: true },
      { field: 'data_item', header: 'data_item', label: '数据项', system: false },
    ];
  }

  const items = rows.map((row) => {
    let payload = {};
    try {
      payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload || {};
    } catch {
      payload = {};
    }
    const cells = columns.map((col) => {
      if (col.field === '__rowNum') return { field: col.field, header: col.header, value: row.row_num };
      if (col.field === '__subtype') return { field: col.field, header: col.header, value: row.subtype_name };
      if (col.field === '__version') return { field: col.field, header: col.header, value: row.version_label };
      const val = payload[col.field];
      return {
        field: col.field,
        header: col.header || col.label,
        value: val === null || val === undefined ? '' : String(val),
      };
    });
    return {
      id: row.id,
      subtypeCode: row.subtype_code,
      subtypeName: row.subtype_name,
      versionLabel: row.version_label,
      sheetName: row.sheet_name,
      cells,
    };
  });

  return {
    layout: 'dataset',
    category: cat,
    categoryLabel: getCategoryLabel(cat),
    moduleCode: mod,
    total,
    limit: normalizedLimit,
    offset: normalizedOffset,
    columns: columns.map((c) => ({
      field: c.field,
      header: c.header || c.label,
      label: c.label || c.header,
    })),
    items,
  };
}

/** 按模块 + 标签浏览列表 */
export function browseModuleCategory({ moduleCode, category, keyword, limit, offset } = {}) {
  const cat = normalizeCategory(category);
  if (cat === 'to1104') {
    return browseConversionScripts({ moduleCode, keyword, limit, offset });
  }
  if (cat === 'code_value') {
    return browseCodeValues({ moduleCode, keyword, limit, offset });
  }
  return browseExcelCategory({ moduleCode, category: cat, keyword, limit, offset });
}
