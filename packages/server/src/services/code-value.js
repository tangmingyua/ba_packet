/**
 * 模块码值：批量导入（「码值」Sheet）+ 扩展字段展示映射
 */
import XLSX from 'xlsx';
import { queryAll, queryOne, run, saveDb } from '../db/database.js';
import { resolveSubtypeCode } from '../config/system-subtypes.js';
import { resolveImportSubtypeCode } from './dataset-config.js';

const CODE_VALUE_SHEET_NAME = '码值';
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
    sourceSheet: sourceSheet || CODE_VALUE_SHEET_NAME,
  };

  for (let i = 0; i < EXTEND_FIELD_COUNT; i += 1) {
    record[`extend_${i + 1}`] = cellToString(row[3 + i]);
  }
  return record;
}

function findCodeValueSheet(workbook) {
  if (workbook.Sheets[CODE_VALUE_SHEET_NAME]) return CODE_VALUE_SHEET_NAME;
  return null;
}

function trimTrailingEmptyHeaders(headers) {
  let end = headers.length;
  while (end > CORE_HEADERS.length && headers[end - 1] === '') {
    end -= 1;
  }
  return headers.slice(0, end);
}

function validateHeader(headerRow) {
  const headers = trimTrailingEmptyHeaders((headerRow || []).map((h) => cellToString(h)));
  for (let i = 0; i < CORE_HEADERS.length; i += 1) {
    if (headers[i] !== CORE_HEADERS[i]) {
      throw new Error(`表头前 ${CORE_HEADERS.length} 列须为：${CORE_HEADERS.join('、')}`);
    }
  }
  const extendCount = headers.length - CORE_HEADERS.length;
  if (extendCount > EXTEND_FIELD_COUNT) {
    throw new Error(`扩展字段最多 ${EXTEND_FIELD_COUNT} 列`);
  }
  for (let i = 0; i < extendCount; i += 1) {
    const expected = `${EXTEND_HEADER_PREFIX}${i + 1}`;
    if (headers[CORE_HEADERS.length + i] !== expected) {
      throw new Error(`第 ${CORE_HEADERS.length + i + 1} 列表头应为「${expected}」`);
    }
  }
}

function findDuplicateCodeValues(records) {
  const seen = new Map();
  const duplicates = [];
  for (const rec of records) {
    const key = `${rec.dictName}\0${rec.code}`;
    if (seen.has(key)) {
      duplicates.push({
        dictName: rec.dictName,
        code: rec.code,
        firstRow: seen.get(key),
        rowNum: rec.rowNum,
      });
    } else {
      seen.set(key, rec.rowNum);
    }
  }
  return duplicates;
}

function buildDuplicateCodeValueError(duplicates) {
  let msg =
    '导入失败：Excel「码值」Sheet 中存在重复的码值。同一码表（码值名称）下，码值代码不能出现两次。';
  const lines = duplicates.slice(0, 8).map(
    (d) => `第 ${d.rowNum} 行与第 ${d.firstRow} 行重复（码值名称「${d.dictName}」、码值代码「${d.code}」）`
  );
  if (lines.length) msg += `\n${lines.join('\n')}`;
  if (duplicates.length > 8) msg += `\n…等共 ${duplicates.length} 处重复`;
  return msg;
}

function isCodeValueUniqueConstraintError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('UNIQUE constraint failed') && msg.includes('module_code_values');
}

/**
 * 从 Excel 批量导入码值（全量替换该模块下码值数据，不影响展示映射）
 */
export function importModuleCodeValues(buffer, { moduleCode, fileName, subtypeCode } = {}) {
  const normalizedModule = normalizeModuleCode(moduleCode);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = findCodeValueSheet(workbook);
  if (!sheetName) {
    throw new Error(`未找到 Sheet「${CODE_VALUE_SHEET_NAME}」`);
  }

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  if (!matrix.length) throw new Error('Sheet 为空');

  validateHeader(matrix[0]);

  const records = [];
  const dictNames = new Set();
  for (let i = 1; i < matrix.length; i += 1) {
    const parsed = rowToCodeValue(matrix[i], normalizedModule, fileName, sheetName);
    if (!parsed) continue;
    parsed.rowNum = i + 1;
    dictNames.add(parsed.dictName);
    records.push(parsed);
  }

  if (!records.length) throw new Error('无有效码值行（码值名称、码值代码均必填）');

  const duplicates = findDuplicateCodeValues(records);
  if (duplicates.length) {
    throw new Error(buildDuplicateCodeValueError(duplicates));
  }

  run('DELETE FROM module_code_values WHERE module_code = ?', [normalizedModule]);

  const resolvedSubtypeCode = subtypeCode
    ? resolveImportSubtypeCode(subtypeCode, 'code_value', { moduleCode: normalizedModule })
    : resolveSubtypeCode('code_value', normalizedModule);
  const extendCols = buildExtendKeys().join(', ');
  const placeholders = ['?', '?', '?', '?', '?', ...Array(EXTEND_FIELD_COUNT).fill('?'), '?', '?', '?'].join(', ');

  for (const rec of records) {
    try {
      run(
        `INSERT INTO module_code_values (
          subtype_code, module_code, dict_name, code, meaning,
          ${extendCols},
          source_file, source_sheet, imported_at
        ) VALUES (${placeholders})`,
        [
          resolvedSubtypeCode,
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
    } catch (err) {
      if (isCodeValueUniqueConstraintError(err)) {
        throw new Error(
          `导入失败：存在重复的码值（码值名称「${rec.dictName}」、码值代码「${rec.code}」）。同一码表下码值代码不能重复，请检查 Excel「码值」Sheet。`
        );
      }
      throw err;
    }
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
