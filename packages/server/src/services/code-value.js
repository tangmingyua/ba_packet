/**
 * 模块码值：批量导入（码值更新格式 Sheet）+ 扩展字段展示映射
 */
import XLSX from 'xlsx';
import { queryAll, queryOne, run, saveDb } from '../db/database.js';

const CODE_VALUE_SHEET_NAMES = ['码值更新格式', 'Sheet1'];
const EXTEND_FIELD_COUNT = 11;
const EXTEND_HEADER_PREFIX = '扩展字段';
const CORE_HEADERS = ['码值名称', '码值代码', '码值含义'];
const CORE_DISPLAY_FIELD_KEYS = ['dict_name', 'code', 'meaning'];

function buildExtendKeys() {
  return Array.from({ length: EXTEND_FIELD_COUNT }, (_, i) => `extend_${i + 1}`);
}

export function buildDisplayFieldKeys() {
  return [...CORE_DISPLAY_FIELD_KEYS, ...buildExtendKeys()];
}

function cellToString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeModuleCode(code) {
  const normalized = String(code || '').trim();
  if (!normalized) throw new Error('请选择模块（主类）');
  return normalized;
}

function rowToCodeValue(row, moduleCode, sourceFile, sourceSheet) {
  const dictName = cellToString(row[0]);
  const code = cellToString(row[1]);
  if (!dictName || !code) return null;

  const record = {
    moduleCode,
    dictName,
    code,
    meaning: cellToString(row[2]),
    sourceFile: sourceFile || null,
    sourceSheet: sourceSheet || '码值更新格式',
  };

  for (let i = 0; i < EXTEND_FIELD_COUNT; i += 1) {
    record[`extend_${i + 1}`] = cellToString(row[3 + i]);
  }
  return record;
}

function findCodeValueSheet(workbook) {
  for (const name of CODE_VALUE_SHEET_NAMES) {
    if (workbook.Sheets[name]) return name;
  }
  return null;
}

function validateHeader(headerRow) {
  const headers = (headerRow || []).map((h) => cellToString(h));
  for (let i = 0; i < CORE_HEADERS.length; i += 1) {
    if (headers[i] !== CORE_HEADERS[i]) {
      throw new Error(`表头须为：${CORE_HEADERS.join('、')}、扩展字段1 … 扩展字段11`);
    }
  }
  for (let i = 0; i < EXTEND_FIELD_COUNT; i += 1) {
    const expected = `${EXTEND_HEADER_PREFIX}${i + 1}`;
    if (headers[3 + i] !== expected) {
      throw new Error(`第 ${i + 4} 列表头应为「${expected}」`);
    }
  }
}

/**
 * 从 Excel 批量导入码值（全量替换该模块下码值数据，不影响展示映射）
 */
export function importModuleCodeValues(buffer, { moduleCode, fileName } = {}) {
  const normalizedModule = normalizeModuleCode(moduleCode);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = findCodeValueSheet(workbook);
  if (!sheetName) {
    throw new Error(`未找到 Sheet「${CODE_VALUE_SHEET_NAMES.join('」或「')}」`);
  }

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  if (!matrix.length) throw new Error('Sheet 为空');

  validateHeader(matrix[0]);

  const records = [];
  const dictNames = new Set();
  for (let i = 1; i < matrix.length; i += 1) {
    const parsed = rowToCodeValue(matrix[i], normalizedModule, fileName, sheetName);
    if (!parsed) continue;
    dictNames.add(parsed.dictName);
    records.push(parsed);
  }

  if (!records.length) throw new Error('无有效码值行（码值名称、码值代码均必填）');

  run('DELETE FROM module_code_values WHERE module_code = ?', [normalizedModule]);

  const extendCols = buildExtendKeys().join(', ');
  const placeholders = ['?', '?', '?', '?', ...Array(EXTEND_FIELD_COUNT).fill('?'), '?', '?', '?'].join(', ');

  for (const rec of records) {
    run(
      `INSERT INTO module_code_values (
        module_code, dict_name, code, meaning,
        ${extendCols},
        source_file, source_sheet, imported_at
      ) VALUES (${placeholders})`,
      [
        rec.moduleCode,
        rec.dictName,
        rec.code,
        rec.meaning,
        ...buildExtendKeys().map((k) => rec[k]),
        rec.sourceFile,
        rec.sourceSheet,
        new Date().toISOString(),
      ]
    );
  }

  saveDb();

  return {
    moduleCode: normalizedModule,
    sheetName,
    imported: records.length,
    dictCount: dictNames.size,
    dictNames: [...dictNames].sort((a, b) => a.localeCompare(b, 'zh')),
    fileName: fileName || null,
  };
}

function mapCodeValueRow(row, dictName) {
  const item = {
    dict_name: dictName,
    code: row.code,
    meaning: row.meaning || '',
  };
  for (let i = 1; i <= EXTEND_FIELD_COUNT; i += 1) {
    item[`extend_${i}`] = row[`extend_${i}`] || '';
  }
  return item;
}

export function listModuleCodeValues(moduleCode, dictName) {
  const mod = normalizeModuleCode(moduleCode);
  const name = cellToString(dictName);
  if (!name) throw new Error('请提供 dict_name（码表名称）');

  const items = queryAll(
    `
    SELECT code, meaning,
      extend_1, extend_2, extend_3, extend_4, extend_5, extend_6,
      extend_7, extend_8, extend_9, extend_10, extend_11
    FROM module_code_values
    WHERE module_code = ? AND dict_name = ?
    ORDER BY code
    `,
    [mod, name]
  ).map((row) => mapCodeValueRow(row, name));

  return {
    module: mod,
    dictName: name,
    items,
    total: items.length,
    display: listCodeValueDisplay(mod, name),
  };
}

export function listModuleCodeValueDictNames(moduleCode) {
  const mod = normalizeModuleCode(moduleCode);
  return queryAll(
    `
    SELECT dict_name AS dictName, COUNT(*) AS count
    FROM module_code_values
    WHERE module_code = ?
    GROUP BY dict_name
    ORDER BY dict_name
    `,
    [mod]
  );
}

export function listCodeValueDisplay(moduleCode, dictName) {
  const mod = normalizeModuleCode(moduleCode);
  const name = cellToString(dictName);
  if (!name) return [];

  const rows = queryAll(
    `
    SELECT field_key AS fieldKey, display_label AS displayLabel, sort_order AS sortOrder, visible
    FROM module_code_dict_display
    WHERE module_code = ? AND dict_name = ?
    ORDER BY sort_order, field_key
    `,
    [mod, name]
  );

  return rows.map((r) => ({
    fieldKey: r.fieldKey,
    displayLabel: r.displayLabel,
    sortOrder: r.sortOrder ?? 0,
    visible: Boolean(r.visible),
  }));
}

export function saveCodeValueDisplay(moduleCode, dictName, fields = []) {
  const mod = normalizeModuleCode(moduleCode);
  const name = cellToString(dictName);
  if (!name) throw new Error('请提供 dict_name（码表名称）');

  const validKeys = new Set(buildDisplayFieldKeys());
  run('DELETE FROM module_code_dict_display WHERE module_code = ? AND dict_name = ?', [mod, name]);

  for (const field of fields) {
    const fieldKey = cellToString(field.fieldKey);
    const displayLabel = cellToString(field.displayLabel);
    if (!fieldKey || !validKeys.has(fieldKey)) continue;
    if (!displayLabel) continue;
    run(
      `INSERT INTO module_code_dict_display (module_code, dict_name, field_key, display_label, sort_order, visible)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        mod,
        name,
        fieldKey,
        displayLabel,
        Number(field.sortOrder) || 0,
        field.visible === false ? 0 : 1,
      ]
    );
  }

  saveDb();
  return { moduleCode: mod, dictName: name, display: listCodeValueDisplay(mod, name) };
}

export function getModuleCodeValueSummary(moduleCode) {
  const mod = normalizeModuleCode(moduleCode);
  const total = Number(
    queryOne('SELECT COUNT(*) AS c FROM module_code_values WHERE module_code = ?', [mod])?.c || 0
  );
  const dicts = listModuleCodeValueDictNames(mod);
  const lastImport = queryOne(
    `
    SELECT source_file AS sourceFile, source_sheet AS sourceSheet, MAX(imported_at) AS importedAt
    FROM module_code_values
    WHERE module_code = ?
    `,
    [mod]
  );
  return { moduleCode: mod, total, dicts, lastImport: lastImport || null };
}
