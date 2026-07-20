/**
 * 配置驱动 Excel 导入引擎
 * 按子类版本映射校验表头，逐 sheet 独立事务写入 datasets / data_records
 */
import crypto from 'crypto';
import XLSX from 'xlsx';
import { queryOne, run, saveDb } from '../db/database.js';
import {
  clearVersionRecords,
  findVersionBySheetName,
  getSubtype,
  getSubtypeVersion,
  listFieldMappings,
  listSubtypes,
  listSubtypeVersions,
} from './dataset-config.js';

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function cellToString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function insertRecord({ datasetId, versionId, sheetName, rowNum, payload, stdCategory = 'norm' }) {
  const payloadJson = JSON.stringify(payload);
  run(
    `INSERT INTO data_records (
      dataset_id, subtype_version_id, sheet_name, row_num, biz_key, payload,
      std_subtype, std_version, std_data_item, std_category
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datasetId,
      versionId,
      sheetName,
      rowNum,
      String(rowNum),
      payloadJson,
      payload.subtype || '',
      payload.version || '',
      payload.data_item || '',
      stdCategory,
    ]
  );
}

/**
 * 解析工作簿为 { sheetName, headers, rows }[]
 * headerRow / dataStartRow 为 1-based
 */
export function parseWorkbookSheets(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    return { sheetName, matrix };
  });
}

function extractHeaders(matrix, headerRow) {
  const idx = Math.max(0, headerRow - 1);
  const row = matrix[idx] || [];
  return row.map((cell, i) => {
    const name = cellToString(cell);
    return name || `__EMPTY_COL_${i}`;
  });
}

/**
 * 校验表头与映射
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateHeaders(excelHeaders, mappings) {
  const headerSet = new Set(excelHeaders.filter((h) => !h.startsWith('__EMPTY_COL_')));
  const mappedOriginals = mappings.map((m) => m.originalColumn);

  const extra = [...headerSet].filter((h) => !mappedOriginals.includes(h));
  if (extra.length) {
    return { ok: false, message: `存在未配置的多余列：${extra.join('、')}` };
  }

  const requiredMissing = mappings
    .filter((m) => m.isRequired)
    .map((m) => m.originalColumn)
    .filter((col) => !headerSet.has(col));
  if (requiredMissing.length) {
    return { ok: false, message: `缺少必填列：${requiredMissing.join('、')}` };
  }

  return { ok: true };
}

function mapRowToPayload(rowCells, excelHeaders, mappings) {
  const headerIndex = new Map(excelHeaders.map((h, i) => [h, i]));
  const payload = {};
  for (const m of mappings) {
    const idx = headerIndex.get(m.originalColumn);
    payload[m.standardField] = idx === undefined ? '' : cellToString(rowCells[idx]);
  }
  return payload;
}

function validateRequiredValues(payload, mappings, rowNum) {
  for (const m of mappings) {
    if (!m.isRequired) continue;
    if (!cellToString(payload[m.standardField])) {
      return `第 ${rowNum} 行必填字段「${m.standardField}」为空`;
    }
  }
  return null;
}

/**
 * 解析用户指定的版本 ID 列表（multipart 可能是 JSON 字符串或逗号分隔）
 */
function parseSelectedVersionIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(Number).filter(Boolean);
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(Number).filter(Boolean);
  } catch {
    // ignore
  }
  return text
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean);
}

/**
 * 为单个 sheet 选择目标版本
 */
function resolveVersionForSheet(sheetName, selectedVersionIds) {
  if (selectedVersionIds.length) {
    for (const id of selectedVersionIds) {
      const version = getSubtypeVersion(id);
      if (!version) continue;
      const subtype = getSubtype(version.subtypeCode);
      if (!subtype?.enabled) continue;
      if (version.sheetName === sheetName && version.status === 'active') {
        return version;
      }
    }
    return null;
  }
  return findVersionBySheetName(sheetName);
}

/** 已启用且已配置映射的版本 → 期望 Sheet 名列表 */
function listImportableSheetNames() {
  const names = [];
  for (const st of listSubtypes().filter((s) => s.enabled)) {
    for (const v of listSubtypeVersions(st.code)) {
      if (v.status !== 'active') continue;
      if (listFieldMappings(v.id).length > 0) {
        names.push({
          subtypeCode: st.code,
          subtypeName: st.name,
          versionLabel: v.versionLabel,
          sheetName: v.sheetName,
        });
      }
    }
  }
  return names;
}

function buildSkipMessage(sheetName, selectedVersionIds) {
  const importable = listImportableSheetNames();
  if (!importable.length) {
    const enabled = listSubtypes().filter((s) => s.enabled);
    const noVersion = enabled.filter((s) => !listSubtypeVersions(s.code).length);
    if (noVersion.length) {
      const names = noVersion.map((s) => s.name).join('、');
      return `子类「${names}」已启用，但尚未创建版本。请先在下方「版本列表」新建版本并保存字段映射。`;
    }
    return '已启用的子类尚无可用版本（需完成字段映射并保存）。';
  }

  if (selectedVersionIds.length) {
    const selected = selectedVersionIds
      .map((id) => getSubtypeVersion(id))
      .filter(Boolean)
      .map((v) => `「${v.sheetName}」(${v.versionLabel})`);
    return `Sheet「${sheetName}」与所选版本不匹配。所选版本要求 Sheet：${selected.join('、') || '无'}`;
  }

  const expected = importable.map((x) => `「${x.sheetName}」(${x.subtypeName})`).join('、');
  return `Sheet「${sheetName}」未匹配任何版本。当前可导入的 Sheet 名：${expected}`;
}

function insertDataset({ name, description, sourceFileName, sheetName, versionId, fileHash }) {
  run(
    `INSERT INTO datasets (name, description, source_file_name, sheet_name, subtype_version_id, file_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, description || null, sourceFileName || null, sheetName, versionId, fileHash || null]
  );
  const row = queryOne('SELECT last_insert_rowid() AS id');
  return Number(row.id);
}

/**
 * 导入单个 sheet（失败不影响其他 sheet；本 sheet 内失败则回滚本 sheet）
 */
function importOneSheet({ sheet, version, sourceFileName, fileHash, description }) {
  const mappings = listFieldMappings(version.id);
  if (!mappings.length) {
    return {
      sheetName: sheet.sheetName,
      status: 'failed',
      message: '该版本尚未配置字段映射',
    };
  }

  const subtype = getSubtype(version.subtypeCode);
  const headers = extractHeaders(sheet.matrix, version.headerRow);
  const headerCheck = validateHeaders(headers, mappings);
  if (!headerCheck.ok) {
    return {
      sheetName: sheet.sheetName,
      status: 'failed',
      message: headerCheck.message,
      subtypeCode: version.subtypeCode,
      versionId: version.id,
      versionLabel: version.versionLabel,
    };
  }

  const dataStart = Math.max(0, version.dataStartRow - 1);
  const pendingRows = [];

  for (let i = dataStart; i < sheet.matrix.length; i += 1) {
    const rowCells = sheet.matrix[i] || [];
    const excelRowNum = i + 1;
    if (rowCells.every((c) => cellToString(c) === '')) continue;

    const payload = mapRowToPayload(rowCells, headers, mappings);

    // subtype: 仅系统
    payload.subtype = subtype.name;

    // version: 优先系统，否则 Excel，都无则失败
    const systemVersion = version.versionLabel;
    const excelVersion = cellToString(payload.version);
    if (systemVersion) {
      payload.version = systemVersion;
    } else if (excelVersion) {
      payload.version = excelVersion;
    } else {
      return {
        sheetName: sheet.sheetName,
        status: 'failed',
        message: '无法确定版本：未选择系统版本且 Excel 无版本列',
        subtypeCode: version.subtypeCode,
        versionId: version.id,
        versionLabel: version.versionLabel,
      };
    }

    const reqErr = validateRequiredValues(payload, mappings, excelRowNum);
    if (reqErr) {
      return {
        sheetName: sheet.sheetName,
        status: 'failed',
        message: reqErr,
        subtypeCode: version.subtypeCode,
        versionId: version.id,
        versionLabel: version.versionLabel,
      };
    }

    pendingRows.push({
      rowNum: excelRowNum,
      payload,
    });
  }

  if (!pendingRows.length) {
    return {
      sheetName: sheet.sheetName,
      status: 'failed',
      message: '无有效数据行',
      subtypeCode: version.subtypeCode,
      versionId: version.id,
      versionLabel: version.versionLabel,
    };
  }

  let inserted = 0;
  clearVersionRecords(version.id);
  const datasetId = insertDataset({
    name: `${sourceFileName || 'import'} / ${sheet.sheetName}`,
    description,
    sourceFileName,
    sheetName: sheet.sheetName,
    versionId: version.id,
    fileHash,
  });

  try {
    for (const row of pendingRows) {
      insertRecord({
        datasetId,
        versionId: version.id,
        sheetName: sheet.sheetName,
        rowNum: row.rowNum,
        payload: row.payload,
        stdCategory: subtype.category || 'norm',
      });
      inserted += 1;
    }
    saveDb();
  } catch (error) {
    clearVersionRecords(version.id);
    saveDb();
    return {
      sheetName: sheet.sheetName,
      status: 'failed',
      message: error.message || '写入失败',
      subtypeCode: version.subtypeCode,
      versionId: version.id,
      versionLabel: version.versionLabel,
    };
  }

  return {
    sheetName: sheet.sheetName,
    status: 'success',
    message: `导入成功：共 ${inserted} 行（已替换该版本原有数据）`,
    subtypeCode: version.subtypeCode,
    subtypeName: subtype.name,
    versionId: version.id,
    versionLabel: version.versionLabel,
    datasetId,
    recordCount: pendingRows.length,
    inserted,
    updated: 0,
  };
}

/**
 * 执行配置驱动导入
 * @param {Buffer} buffer
 * @param {object} options
 * @param {string} [options.fileName]
 * @param {string|number[]|string} [options.versionIds] 用户选定的版本
 * @param {string} [options.description]
 */
export function importDatasetExcel(buffer, options = {}) {
  const fileName = options.fileName || 'upload.xlsx';
  const selectedVersionIds = parseSelectedVersionIds(options.versionIds);
  const fileHash = hashBuffer(buffer);
  const sheets = parseWorkbookSheets(buffer);

  const results = [];
  const skipped = [];

  for (const sheet of sheets) {
    const version = resolveVersionForSheet(sheet.sheetName, selectedVersionIds);
    if (!version) {
      skipped.push({
        sheetName: sheet.sheetName,
        status: 'skipped',
        message: buildSkipMessage(sheet.sheetName, selectedVersionIds),
      });
      continue;
    }

    const result = importOneSheet({
      sheet,
      version,
      sourceFileName: fileName,
      fileHash,
      description: options.description || '',
    });
    results.push(result);
  }

  const success = results.filter((r) => r.status === 'success');
  const failed = results.filter((r) => r.status === 'failed');

  return {
    fileName,
    fileHash,
    sheets: [...results, ...skipped],
    summary: {
      success: success.length,
      failed: failed.length,
      skipped: skipped.length,
      inserted: success.reduce((n, r) => n + (r.inserted || 0), 0),
      updated: success.reduce((n, r) => n + (r.updated || 0), 0),
    },
  };
}
