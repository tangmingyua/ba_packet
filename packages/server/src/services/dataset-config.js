/**
 * 新模型配置服务：标准字段、子类、版本、字段映射
 */
import { queryAll, queryOne, run, saveDb } from '../db/database.js';
import { MATERIAL_MODULES, MATERIAL_SUBTYPES } from '../config/import-catalog-static.js';
import {
  getCategoryLabel,
  normalizeCategory,
  listMaterialCategories,
} from '../config/material-categories.js';
import { STANDARD_FIELD_SEEDS } from '../db/seed-standard-fields.js';

function parseJsonArray(value, fallback = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function rowToVersion(row) {
  return {
    id: row.id,
    subtypeCode: row.subtype_code,
    versionLabel: row.version_label,
    sheetName: row.sheet_name,
    headerRow: row.header_row ?? 1,
    dataStartRow: row.data_start_row ?? 2,
    isDefault: Boolean(row.is_default),
    bizKeyFields: parseJsonArray(row.biz_key_fields),
    status: row.status || 'active',
    versionDate: row.version_date || '',
  };
}

function rowToMapping(row) {
  return {
    id: row.id,
    subtypeVersionId: row.subtype_version_id,
    originalColumn: row.original_column,
    standardField: row.standard_field,
    fieldType: row.field_type || 'TEXT',
    isRequired: Boolean(row.is_required),
    defaultDisplay: Boolean(row.is_default_display),
  };
}

function inferCategoryFromCode(code) {
  const preset = MATERIAL_SUBTYPES.find((s) => s.code === code);
  if (preset) return preset.categoryCode === 'FAQ' ? 'qa' : 'norm';
  const upper = String(code || '').toUpperCase();
  if (upper.includes('FAQ') || upper.endsWith('_FAQ')) return 'qa';
  if (upper.includes('CHECK') || upper.includes('校验')) return 'check';
  if (upper.includes('LOGIC') || upper.includes('逻辑')) return 'logic';
  if (upper.includes('PEER') || upper.includes('同业')) return 'peer';
  return 'norm';
}

function inferModuleFromCode(code) {
  const preset = MATERIAL_SUBTYPES.find((s) => s.code === code);
  if (preset?.moduleCode) return preset.moduleCode;
  return 'YBT';
}

function rowToModule(row) {
  return {
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order ?? 0,
    enabled: Boolean(row.enabled ?? 1),
  };
}

function rowToSubtype(row) {
  const category = normalizeCategory(row.category, inferCategoryFromCode(row.code));
  return {
    code: row.code,
    name: row.name,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order ?? 0,
    category,
    categoryLabel: getCategoryLabel(category),
    moduleCode: row.module_code || inferModuleFromCode(row.code),
    moduleName: row.module_name || row.module_code || inferModuleFromCode(row.code),
  };
}

export function listModules() {
  return queryAll('SELECT * FROM modules ORDER BY sort_order, name').map(rowToModule);
}

export function getModule(code) {
  const row = queryOne('SELECT * FROM modules WHERE code = ?', [code]);
  return row ? rowToModule(row) : null;
}

export function upsertModule({ code, name, sortOrder = 0, enabled = true }) {
  const normalizedCode = String(code || '')
    .trim()
    .toUpperCase();
  const normalizedName = String(name || '').trim();
  if (!normalizedCode || !normalizedName) throw new Error('主类 code 与 name 必填');
  if (!/^[A-Z][A-Z0-9_]*$/.test(normalizedCode)) {
    throw new Error('主类 code 须为大写字母开头，仅含大写字母、数字、下划线');
  }
  const existing = getModule(normalizedCode);
  if (existing) {
    run(`UPDATE modules SET name = ?, sort_order = ?, enabled = ? WHERE code = ?`, [
      normalizedName,
      sortOrder,
      enabled ? 1 : 0,
      normalizedCode,
    ]);
  } else {
    run(`INSERT INTO modules (code, name, sort_order, enabled) VALUES (?, ?, ?, ?)`, [
      normalizedCode,
      normalizedName,
      sortOrder,
      enabled ? 1 : 0,
    ]);
  }
  saveDb();
  return getModule(normalizedCode);
}

export function deleteModule(code) {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) throw new Error('请指定要删除的主类');
  const existing = getModule(normalizedCode);
  if (!existing) throw new Error('主类不存在');
  const used = Number(
    queryOne('SELECT COUNT(*) AS c FROM subtypes WHERE module_code = ?', [normalizedCode])?.c || 0
  );
  if (used > 0) throw new Error(`主类下仍有 ${used} 个子类，无法删除`);
  run('DELETE FROM modules WHERE code = ?', [normalizedCode]);
  saveDb();
  return { code: normalizedCode };
}

function resolveModuleCode(moduleCode, subtypeCode) {
  const code = String(moduleCode || inferModuleFromCode(subtypeCode)).trim();
  if (!getModule(code)) throw new Error(`主类不存在：${code}`);
  return code;
}

/** 种子：标准字段（增量） + 子类目录（空库时） */
export function seedDatasetConfigIfEmpty() {
  for (const f of STANDARD_FIELD_SEEDS) {
    run(
      `INSERT OR IGNORE INTO standard_fields (code, label, is_system, sort_order) VALUES (?, ?, ?, ?)`,
      [f.code, f.label, f.isSystem ? 1 : 0, f.sortOrder]
    );
  }

  const subtypeCount = Number(queryOne('SELECT COUNT(*) AS c FROM subtypes')?.c || 0);
  if (subtypeCount === 0) {
    MATERIAL_SUBTYPES.forEach((st, index) => {
      run(
        `INSERT INTO subtypes (code, name, enabled, sort_order) VALUES (?, ?, ?, ?)`,
        [st.code, st.name, st.importEnabled ? 1 : 0, index]
      );
    });
  }
  saveDb();
}

export function listStandardFields() {
  return queryAll('SELECT * FROM standard_fields ORDER BY sort_order, code').map((row) => ({
    code: row.code,
    label: row.label,
    isSystem: Boolean(row.is_system),
    sortOrder: row.sort_order ?? 0,
  }));
}

export function createStandardField({ code, label, isSystem = false }) {
  const normalizedCode = String(code || '').trim();
  const normalizedLabel = String(label || '').trim();
  if (!normalizedCode || !normalizedLabel) throw new Error('标准字段 code 与 label 必填');
  if (!/^[a-z][a-z0-9_]*$/.test(normalizedCode)) {
    throw new Error('code 须为小写字母开头，仅含小写字母、数字、下划线');
  }
  const exists = queryOne('SELECT code FROM standard_fields WHERE code = ?', [normalizedCode]);
  if (exists) throw new Error(`标准字段已存在：${normalizedCode}`);
  const maxOrder = Number(queryOne('SELECT MAX(sort_order) AS m FROM standard_fields')?.m || 0);
  run(
    `INSERT INTO standard_fields (code, label, is_system, sort_order) VALUES (?, ?, ?, ?)`,
    [normalizedCode, normalizedLabel, isSystem ? 1 : 0, maxOrder + 1]
  );
  saveDb();
  return listStandardFields().find((f) => f.code === normalizedCode);
}

const PROTECTED_STANDARD_FIELDS = new Set(['subtype', 'version', 'data_item']);

/** 删除标准字段（系统字段与已被映射引用的不可删） */
export function deleteStandardField(code) {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) throw new Error('请指定要删除的标准字段');
  const row = queryOne('SELECT * FROM standard_fields WHERE code = ?', [normalizedCode]);
  if (!row) throw new Error('标准字段不存在');
  if (row.is_system || PROTECTED_STANDARD_FIELDS.has(normalizedCode)) {
    throw new Error(`「${row.label}」为系统保留字段，不可删除`);
  }
  const used = queryOne(
    'SELECT COUNT(*) AS c FROM field_mappings WHERE standard_field = ?',
    [normalizedCode]
  );
  if (Number(used?.c || 0) > 0) {
    throw new Error(`该字段已被 ${used.c} 条版本映射引用，请先从各版本映射中移除后再删除`);
  }
  run('DELETE FROM standard_fields WHERE code = ?', [normalizedCode]);
  saveDb();
  return { code: normalizedCode };
}

export function listSubtypes() {
  return queryAll(
    `
    SELECT s.*, m.name AS module_name
    FROM subtypes s
    LEFT JOIN modules m ON m.code = s.module_code
    ORDER BY s.sort_order, s.name
    `
  ).map(rowToSubtype);
}

export function getSubtype(code) {
  const row = queryOne(
    `
    SELECT s.*, m.name AS module_name
    FROM subtypes s
    LEFT JOIN modules m ON m.code = s.module_code
    WHERE s.code = ?
    `,
    [code]
  );
  return row ? rowToSubtype(row) : null;
}

export function upsertSubtype({
  code,
  name,
  enabled = false,
  sortOrder = 0,
  category,
  moduleCode,
}) {
  if (!code || !name) throw new Error('子类 code 与 name 必填');
  const normalizedCategory = normalizeCategory(category, inferCategoryFromCode(code));
  const normalizedModule = resolveModuleCode(moduleCode, code);
  const existing = getSubtype(code);
  if (existing) {
    run(
      `UPDATE subtypes SET name = ?, enabled = ?, sort_order = ?, category = ?, module_code = ? WHERE code = ?`,
      [name, enabled ? 1 : 0, sortOrder, normalizedCategory, normalizedModule, code]
    );
  } else {
    run(
      `INSERT INTO subtypes (code, name, enabled, sort_order, category, module_code) VALUES (?, ?, ?, ?, ?, ?)`,
      [code, name, enabled ? 1 : 0, sortOrder, normalizedCategory, normalizedModule]
    );
  }
  saveDb();
  return getSubtype(code);
}

export function updateSubtype(code, patch) {
  const existing = getSubtype(code);
  if (!existing) throw new Error('子类不存在');
  const nextCategory =
    patch.category !== undefined
      ? normalizeCategory(patch.category, existing.category)
      : existing.category;
  const nextModule =
    patch.moduleCode !== undefined
      ? resolveModuleCode(patch.moduleCode, code)
      : existing.moduleCode;
  run(
    `UPDATE subtypes SET name = ?, enabled = ?, sort_order = ?, category = ?, module_code = ? WHERE code = ?`,
    [
      patch.name ?? existing.name,
      patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled ? 1 : 0,
      patch.sortOrder ?? existing.sortOrder,
      nextCategory,
      nextModule,
      code,
    ]
  );
  if (patch.category !== undefined) {
    run(
      `UPDATE data_records SET std_category = ?
       WHERE subtype_version_id IN (
         SELECT id FROM subtype_versions WHERE subtype_code = ?
       )`,
      [nextCategory, code]
    );
  }
  saveDb();
  return getSubtype(code);
}

export function deleteSubtype(code) {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) throw new Error('请指定要删除的子类');
  const existing = getSubtype(normalizedCode);
  if (!existing) throw new Error('子类不存在');
  const versions = listSubtypeVersions(normalizedCode);
  for (const v of versions) {
    deleteSubtypeVersion(v.id);
  }
  run('DELETE FROM subtypes WHERE code = ?', [normalizedCode]);
  saveDb();
  return { code: normalizedCode };
}

export function listSubtypeVersions(subtypeCode) {
  const rows = subtypeCode
    ? queryAll(
        `SELECT * FROM subtype_versions WHERE subtype_code = ? ORDER BY id`,
        [subtypeCode]
      )
    : queryAll(`SELECT * FROM subtype_versions ORDER BY subtype_code, id`);
  return rows.map(rowToVersion);
}

export function getSubtypeVersion(id) {
  const row = queryOne('SELECT * FROM subtype_versions WHERE id = ?', [id]);
  return row ? rowToVersion(row) : null;
}

export function findVersionBySheetName(sheetName) {
  const row = queryOne(
    `SELECT sv.* FROM subtype_versions sv
     JOIN subtypes s ON s.code = sv.subtype_code
     WHERE sv.sheet_name = ? AND s.enabled = 1 AND sv.status = 'active'`,
    [sheetName]
  );
  return row ? rowToVersion(row) : null;
}

export function createSubtypeVersion(subtypeCode, body) {
  const subtype = getSubtype(subtypeCode);
  if (!subtype) throw new Error('子类不存在');
  const versionLabel = String(body.versionLabel || '').trim();
  const sheetName = String(body.sheetName || '').trim();
  if (!versionLabel) throw new Error('请填写版本号');
  if (!sheetName) throw new Error('请填写 Sheet 名');

  if (body.isDefault) {
    run(`UPDATE subtype_versions SET is_default = 0 WHERE subtype_code = ?`, [subtypeCode]);
  }

  // 新建前取该子类「上一版本」（最新一条），用于复制字段映射
  const previous = queryOne(
    `SELECT id FROM subtype_versions WHERE subtype_code = ? ORDER BY id DESC LIMIT 1`,
    [subtypeCode]
  );

  run(
    `INSERT INTO subtype_versions (
      subtype_code, version_label, sheet_name, header_row, data_start_row,
      is_default, biz_key_fields, status, version_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      subtypeCode,
      versionLabel,
      sheetName,
      body.headerRow ?? 1,
      body.dataStartRow ?? 2,
      body.isDefault ? 1 : 0,
      JSON.stringify(body.bizKeyFields || []),
      String(body.versionDate || '').trim(),
    ]
  );
  saveDb();
  const row = queryOne(
    `SELECT * FROM subtype_versions WHERE subtype_code = ? AND version_label = ?`,
    [subtypeCode, versionLabel]
  );
  const created = rowToVersion(row);

  if (previous?.id) {
    const sourceMappings = listFieldMappings(Number(previous.id));
    if (sourceMappings.length) {
      saveFieldMappings(
        created.id,
        sourceMappings.map((m) => ({
          originalColumn: m.originalColumn,
          standardField: m.standardField,
          fieldType: m.fieldType,
          isRequired: m.isRequired,
          defaultDisplay: m.defaultDisplay,
        }))
      );
    }
  }

  return created;
}

export function countRecordsForVersion(versionId) {
  return Number(
    queryOne('SELECT COUNT(*) AS c FROM data_records WHERE subtype_version_id = ?', [versionId])
      ?.c || 0
  );
}

export function clearVersionRecords(versionId) {
  const version = getSubtypeVersion(versionId);
  if (!version) throw new Error('版本不存在');
  const datasets = queryAll('SELECT id FROM datasets WHERE subtype_version_id = ?', [versionId]);
  run('DELETE FROM data_records WHERE subtype_version_id = ?', [versionId]);
  for (const ds of datasets) {
    run('DELETE FROM datasets WHERE id = ?', [ds.id]);
  }
  saveDb();
  return { clearedDatasets: datasets.length };
}

export function updateSubtypeVersion(id, patch) {
  const existing = getSubtypeVersion(id);
  if (!existing) throw new Error('版本不存在');

  if (patch.isDefault) {
    run(`UPDATE subtype_versions SET is_default = 0 WHERE subtype_code = ?`, [
      existing.subtypeCode,
    ]);
  }

  run(
    `UPDATE subtype_versions SET
      version_label = ?,
      sheet_name = ?,
      header_row = ?,
      data_start_row = ?,
      is_default = ?,
      biz_key_fields = ?,
      status = ?,
      version_date = ?
     WHERE id = ?`,
    [
      patch.versionLabel ?? existing.versionLabel,
      patch.sheetName ?? existing.sheetName,
      patch.headerRow ?? existing.headerRow,
      patch.dataStartRow ?? existing.dataStartRow,
      patch.isDefault !== undefined ? (patch.isDefault ? 1 : 0) : existing.isDefault ? 1 : 0,
      JSON.stringify(patch.bizKeyFields ?? existing.bizKeyFields),
      patch.status ?? existing.status,
      patch.versionDate !== undefined
        ? String(patch.versionDate || '').trim()
        : existing.versionDate || '',
      id,
    ]
  );
  saveDb();
  return getSubtypeVersion(id);
}

export function deleteSubtypeVersion(id) {
  const version = getSubtypeVersion(id);
  if (!version) throw new Error('版本不存在');
  clearVersionRecords(id);
  run('DELETE FROM field_mappings WHERE subtype_version_id = ?', [id]);
  run('DELETE FROM subtype_versions WHERE id = ?', [id]);
  saveDb();
}

export function listFieldMappings(versionId) {
  return queryAll(
    `SELECT * FROM field_mappings WHERE subtype_version_id = ? ORDER BY id`,
    [versionId]
  ).map(rowToMapping);
}

export function saveFieldMappings(versionId, mappings) {
  const version = getSubtypeVersion(versionId);
  if (!version) throw new Error('版本不存在');

  const stdCodes = new Set(listStandardFields().map((f) => f.code));
  const originals = new Set();
  const standards = new Set();

  for (const m of mappings) {
    if (!m.originalColumn || !m.standardField) {
      throw new Error('映射须同时填写 Excel 列名与标准字段');
    }
    if (!stdCodes.has(m.standardField)) {
      throw new Error(`未知标准字段：${m.standardField}`);
    }
    if (originals.has(m.originalColumn)) {
      throw new Error(`重复的 Excel 列名：${m.originalColumn}`);
    }
    if (standards.has(m.standardField)) {
      throw new Error(`重复的标准字段：${m.standardField}`);
    }
    originals.add(m.originalColumn);
    standards.add(m.standardField);
  }

  run('DELETE FROM field_mappings WHERE subtype_version_id = ?', [versionId]);
  for (const m of mappings) {
    run(
      `INSERT INTO field_mappings (
        subtype_version_id, original_column, standard_field, field_type, is_required, is_default_display
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        m.originalColumn,
        m.standardField,
        m.fieldType || 'TEXT',
        m.isRequired ? 1 : 0,
        m.defaultDisplay ? 1 : 0,
      ]
    );
  }
  saveDb();
  return listFieldMappings(versionId);
}

export function getVersionDetail(versionId) {
  const version = getSubtypeVersion(versionId);
  if (!version) return null;
  const subtype = getSubtype(version.subtypeCode);
  return {
    subtype,
    version,
    mappings: listFieldMappings(versionId),
    recordCount: countRecordsForVersion(versionId),
    standardFields: listStandardFields(),
  };
}

export function getDatasetCatalog() {
  const subtypes = listSubtypes().map((st) => ({
    ...st,
    versions: listSubtypeVersions(st.code).map((v) => ({
      ...v,
      mappingCount: listFieldMappings(v.id).length,
      recordCount: countRecordsForVersion(v.id),
    })),
  }));
  return {
    modules: listModules(),
    standardFields: listStandardFields(),
    categories: listMaterialCategories(),
    subtypes,
  };
}

export function listDatasets(limit = 50) {
  return queryAll(
    `
    SELECT d.*, sv.version_label, sv.subtype_code, s.name AS subtype_name
    FROM datasets d
    JOIN subtype_versions sv ON sv.id = d.subtype_version_id
    JOIN subtypes s ON s.code = sv.subtype_code
    ORDER BY d.imported_at DESC
    LIMIT ?
    `,
    [limit]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description || '',
    sourceFileName: row.source_file_name || '',
    sheetName: row.sheet_name,
    subtypeVersionId: row.subtype_version_id,
    subtypeCode: row.subtype_code,
    subtypeName: row.subtype_name,
    versionLabel: row.version_label,
    fileHash: row.file_hash || '',
    importedAt: row.imported_at,
  }));
}

function parseRecordPayload(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

/**
 * 按子类 / 版本查看已导入数据行
 */
export function listVersionRecordsView({
  subtypeCode,
  versionId,
  keyword,
  limit = 100,
  offset = 0,
} = {}) {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const normalizedOffset = Math.max(Number(offset) || 0, 0);
  const where = ['1 = 1'];
  const params = [];

  if (versionId) {
    where.push('r.subtype_version_id = ?');
    params.push(Number(versionId));
  } else if (subtypeCode) {
    where.push('sv.subtype_code = ?');
    params.push(String(subtypeCode).trim());
  }

  const q = String(keyword || '').trim();
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

  const fieldLabelMap = new Map(listStandardFields().map((f) => [f.code, f.label]));

  const parsedRows = rows.map((row) => ({
    ...row,
    payload: parseRecordPayload(row.payload),
  }));

  const columns = buildRecordViewColumns({
    versionId,
    subtypeCode,
    rows: parsedRows,
    fieldLabelMap,
  });

  const items = parsedRows.map((row) => ({
    id: row.id,
    rowNum: row.row_num,
    sheetName: row.sheet_name,
    subtypeCode: row.subtype_code,
    subtypeName: row.subtype_name,
    versionId: row.subtype_version_id,
    versionLabel: row.version_label,
    cells: columns.map((col) => cellValueFromPayload(col, row)),
    linkFields: row.payload?.__has_links || [],
  }));

  return {
    items,
    columns,
    total,
    limit: normalizedLimit,
    offset: normalizedOffset,
    filters: {
      subtypeCode: subtypeCode || null,
      versionId: versionId ? Number(versionId) : null,
      keyword: q || null,
    },
  };
}

function buildRecordViewColumns({ versionId, subtypeCode, rows, fieldLabelMap }) {
  const cols = [{ field: '__rowNum', header: '行号', label: '行号', system: true }];

  if (!versionId && !subtypeCode) {
    return cols;
  }

  if (!versionId) {
    cols.push({ field: '__version', header: '版本', label: '版本', system: true });
  }
  if (!versionId && !subtypeCode) {
    cols.push({ field: '__subtype', header: '子类', label: '子类', system: true });
  }

  const mappingCols = [];
  const seen = new Set();

  const versionIds = versionId
    ? [Number(versionId)]
    : [...new Set(rows.map((r) => r.subtype_version_id))].sort((a, b) => a - b);

  for (const vid of versionIds) {
    for (const m of listFieldMappings(vid)) {
      if (seen.has(m.standardField)) continue;
      seen.add(m.standardField);
      mappingCols.push({
        field: m.standardField,
        header: m.originalColumn,
        label: fieldLabelMap.get(m.standardField) || m.standardField,
        system: false,
      });
    }
  }

  return [...cols, ...mappingCols];
}

function cellValueFromPayload(col, row) {
  const payload = row.payload || {};
  if (col.field === '__rowNum') return row.row_num ?? '';
  if (col.field === '__version') return row.version_label || '';
  if (col.field === '__subtype') return row.subtype_name || '';
  if (col.field === '__sheet') return row.sheet_name || '';
  const val = payload[col.field];
  if (val === null || val === undefined) return '';
  return String(val);
}
