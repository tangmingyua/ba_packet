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

/** 版本 Sheet 名为该值时，走整本「全量导入」流程（须单选该版本） */
export const BULK_IMPORT_VERSION_SHEET_NAME = '全量导入';
export const BULK_CATALOG_SHEET_NAME = '目录';
export const BULK_CATALOG_REPORT_COLUMN = '报表';
/** 全量工作簿「目录」Sheet 表头/数据行（与业务 Sheet 的 headerRow 无关，规范文件目录均在第 1 行） */
export const BULK_CATALOG_HEADER_ROW = 1;
export const BULK_CATALOG_DATA_START_ROW = 2;

export function isBulkImportVersion(version) {
  return version?.sheetName === BULK_IMPORT_VERSION_SHEET_NAME;
}

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
    const linkMatrix = matrix.map((row, r) => {
      if (!row) return [];
      return row.map((_, c) => {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[cellRef];
        return Boolean(cell?.l?.Target);
      });
    });
    return { sheetName, matrix, linkMatrix };
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
 * 校验表头与映射（未映射的 Excel 列默认忽略，不阻断导入）
 * @returns {{ ok: true, ignoredColumns: string[] } | { ok: false, message: string, ignoredColumns: string[] }}
 */
export function validateHeaders(excelHeaders, mappings) {
  const headerSet = new Set(excelHeaders.filter((h) => !h.startsWith('__EMPTY_COL_')));
  const mappedOriginals = mappings.map((m) => m.originalColumn);

  const ignoredColumns = [...headerSet].filter((h) => !mappedOriginals.includes(h));

  const requiredMissing = mappings
    .filter((m) => m.isRequired)
    .map((m) => m.originalColumn)
    .filter((col) => !headerSet.has(col));
  if (requiredMissing.length) {
    return {
      ok: false,
      message: `缺少必填列：${requiredMissing.join('、')}`,
      ignoredColumns: [],
    };
  }

  return { ok: true, ignoredColumns };
}

function mapRowToPayload(rowCells, excelHeaders, mappings, linkRow) {
  const headerIndex = new Map(excelHeaders.map((h, i) => [h, i]));
  const payload = {};
  const linkFields = [];
  for (const m of mappings) {
    const idx = headerIndex.get(m.originalColumn);
    payload[m.standardField] = idx === undefined ? '' : cellToString(rowCells[idx]);
    if (linkRow && idx !== undefined && linkRow[idx]) {
      linkFields.push(m.standardField);
    }
  }
  if (linkFields.length) {
    payload.__has_links = linkFields;
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

function formatIgnoredColumnsNote(ignoredColumns) {
  if (!ignoredColumns?.length) return '';
  return `；已忽略未映射列：${ignoredColumns.join('、')}`;
}

function formatColumnConflictNote(warnings) {
  if (!warnings?.length) return '';
  return `；${warnings.join('；')}`;
}

function catalogRowToMap(headers, rowCells) {
  const map = {};
  headers.forEach((h, i) => {
    map[h] = cellToString(rowCells[i]);
  });
  return map;
}

/**
 * 解析「目录」Sheet：报表列 → 目录行字段
 */
export function parseBulkCatalogSheet(sheet, headerRow, dataStartRow) {
  const headers = extractHeaders(sheet.matrix, headerRow);
  const reportIdx = headers.indexOf(BULK_CATALOG_REPORT_COLUMN);
  if (reportIdx === -1) {
    return { ok: false, message: `目录 Sheet 缺少「${BULK_CATALOG_REPORT_COLUMN}」列` };
  }

  const dataStart = Math.max(0, dataStartRow - 1);
  const byReport = new Map();
  const duplicateReports = new Set();

  for (let i = dataStart; i < sheet.matrix.length; i += 1) {
    const rowCells = sheet.matrix[i] || [];
    const report = cellToString(rowCells[reportIdx]);
    if (!report) continue;
    if (byReport.has(report)) {
      duplicateReports.add(report);
    } else {
      byReport.set(report, catalogRowToMap(headers, rowCells));
    }
  }

  if (duplicateReports.size) {
    return {
      ok: false,
      message: `目录中「${BULK_CATALOG_REPORT_COLUMN}」重复：${[...duplicateReports].join('、')}`,
    };
  }

  return { ok: true, headers, byReport };
}

/**
 * 目录行拼入业务 Sheet 每一行（列名冲突时保留业务列）
 */
export function mergeBusinessSheetWithCatalog({
  sheet,
  catalogHeaders,
  catalogRowMap,
  headerRow,
  dataStartRow,
}) {
  const businessHeaders = extractHeaders(sheet.matrix, headerRow);
  const businessHeaderSet = new Set(
    businessHeaders.filter((h) => !h.startsWith('__EMPTY_COL_'))
  );
  const columnWarnings = [];
  for (const h of catalogHeaders) {
    if (businessHeaderSet.has(h)) {
      columnWarnings.push(`列「${h}」与业务表重复，已采用业务列`);
    }
  }
  const catalogOnlyHeaders = catalogHeaders.filter(
    (h) => !businessHeaderSet.has(h) && !h.startsWith('__EMPTY_COL_')
  );
  const mergedHeaders = [...businessHeaders, ...catalogOnlyHeaders];

  const dataStart = Math.max(0, dataStartRow - 1);
  const dataRows = [];
  for (let i = dataStart; i < sheet.matrix.length; i += 1) {
    const rowCells = sheet.matrix[i] || [];
    const linkRow = sheet.linkMatrix?.[i] || [];
    const excelRowNum = i + 1;
    if (rowCells.every((c) => cellToString(c) === '')) continue;

    const mergedCells = [...rowCells];
    while (mergedCells.length < businessHeaders.length) mergedCells.push('');
    for (const h of catalogOnlyHeaders) {
      mergedCells.push(catalogRowMap?.[h] ?? '');
    }
    dataRows.push({ rowNum: excelRowNum, cells: mergedCells, linkRow });
  }

  return { mergedHeaders, dataRows, columnWarnings };
}

function prepareRowsFromTable({ headers, dataRows, mappings, version, subtype, sheetName }) {
  const headerCheck = validateHeaders(headers, mappings);
  if (!headerCheck.ok) {
    return {
      ok: false,
      message: headerCheck.message,
      ignoredColumns: headerCheck.ignoredColumns || [],
      sheetName,
      subtypeCode: version.subtypeCode,
      versionId: version.id,
      versionLabel: version.versionLabel,
    };
  }
  const ignoredColumns = headerCheck.ignoredColumns || [];
  const pendingRows = [];

  for (const row of dataRows) {
    const payload = mapRowToPayload(row.cells, headers, mappings, row.linkRow);
    payload.subtype = subtype.name;

    const systemVersion = version.versionLabel;
    const excelVersion = cellToString(payload.version);
    if (systemVersion) {
      payload.version = systemVersion;
    } else if (excelVersion) {
      payload.version = excelVersion;
    } else {
      return {
        ok: false,
        message: '无法确定版本：未选择系统版本且 Excel 无版本列',
        sheetName,
        subtypeCode: version.subtypeCode,
        versionId: version.id,
        versionLabel: version.versionLabel,
      };
    }

    const reqErr = validateRequiredValues(payload, mappings, row.rowNum);
    if (reqErr) {
      return {
        ok: false,
        message: reqErr,
        sheetName,
        subtypeCode: version.subtypeCode,
        versionId: version.id,
        versionLabel: version.versionLabel,
      };
    }
    pendingRows.push({ rowNum: row.rowNum, payload });
  }

  if (!pendingRows.length) {
    return {
      ok: false,
      message: '无有效数据行',
      sheetName,
      subtypeCode: version.subtypeCode,
      versionId: version.id,
      versionLabel: version.versionLabel,
    };
  }

  return { ok: true, pendingRows, ignoredColumns, sheetName };
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
  const dataStart = Math.max(0, version.dataStartRow - 1);
  const dataRows = [];
  for (let i = dataStart; i < sheet.matrix.length; i += 1) {
    const rowCells = sheet.matrix[i] || [];
    const linkRow = sheet.linkMatrix?.[i] || [];
    const excelRowNum = i + 1;
    if (rowCells.every((c) => cellToString(c) === '')) continue;
    dataRows.push({ rowNum: excelRowNum, cells: rowCells, linkRow });
  }

  const prepared = prepareRowsFromTable({
    headers,
    dataRows,
    mappings,
    version,
    subtype,
    sheetName: sheet.sheetName,
  });
  if (!prepared.ok) {
    return {
      sheetName: sheet.sheetName,
      status: 'failed',
      message: prepared.message,
      ignoredColumns: prepared.ignoredColumns || [],
      subtypeCode: prepared.subtypeCode,
      versionId: prepared.versionId,
      versionLabel: prepared.versionLabel,
    };
  }
  const { pendingRows, ignoredColumns } = prepared;

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
    message: `导入成功：共 ${inserted} 行（已替换该版本原有数据）${formatIgnoredColumnsNote(ignoredColumns)}`,
    ignoredColumns,
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

function importBulkWorkbook({ sheets, version, sourceFileName, fileHash, description }) {
  const mappings = listFieldMappings(version.id);
  if (!mappings.length) {
    throw new Error('该版本尚未配置字段映射');
  }
  const subtype = getSubtype(version.subtypeCode);
  if (!subtype?.enabled) {
    throw new Error('该子类未启用');
  }

  const catalogSheet = sheets.find((s) => s.sheetName === BULK_CATALOG_SHEET_NAME);
  if (!catalogSheet) {
    throw new Error(`全量导入工作簿须包含 Sheet「${BULK_CATALOG_SHEET_NAME}」`);
  }

  const catalogParsed = parseBulkCatalogSheet(
    catalogSheet,
    BULK_CATALOG_HEADER_ROW,
    BULK_CATALOG_DATA_START_ROW
  );
  if (!catalogParsed.ok) {
    throw new Error(catalogParsed.message);
  }

  const businessSheets = sheets.filter((s) => s.sheetName !== BULK_CATALOG_SHEET_NAME);
  if (!businessSheets.length) {
    throw new Error('除目录外无业务 Sheet');
  }

  const sheetPlans = [];
  const failedResults = [];
  const allColumnWarnings = new Set();

  for (const sheet of businessSheets) {
    const catalogRowMap = catalogParsed.byReport.get(sheet.sheetName) || null;
    const merged = mergeBusinessSheetWithCatalog({
      sheet,
      catalogHeaders: catalogParsed.headers,
      catalogRowMap,
      headerRow: version.headerRow,
      dataStartRow: version.dataStartRow,
    });
    for (const w of merged.columnWarnings) allColumnWarnings.add(w);

    const prepared = prepareRowsFromTable({
      headers: merged.mergedHeaders,
      dataRows: merged.dataRows,
      mappings,
      version,
      subtype,
      sheetName: sheet.sheetName,
    });

    if (!prepared.ok) {
      failedResults.push({
        sheetName: sheet.sheetName,
        status: 'failed',
        message: prepared.message + formatColumnConflictNote(merged.columnWarnings),
        ignoredColumns: prepared.ignoredColumns || [],
        subtypeCode: version.subtypeCode,
        versionId: version.id,
        versionLabel: version.versionLabel,
      });
      continue;
    }

    sheetPlans.push({
      sheetName: sheet.sheetName,
      pendingRows: prepared.pendingRows,
      ignoredColumns: prepared.ignoredColumns,
      columnWarnings: merged.columnWarnings,
    });
  }

  if (failedResults.length) {
    return {
      mode: 'bulk',
      fileName: sourceFileName,
      fileHash,
      sheets: failedResults,
      summary: {
        success: 0,
        failed: failedResults.length,
        skipped: 0,
        inserted: 0,
        updated: 0,
        sheetsWithIgnoredColumns: 0,
        bulkAborted: true,
      },
    };
  }

  const results = [];
  clearVersionRecords(version.id);

  try {
    for (const plan of sheetPlans) {
      const datasetId = insertDataset({
        name: `${sourceFileName || 'import'} / ${plan.sheetName}`,
        description,
        sourceFileName,
        sheetName: plan.sheetName,
        versionId: version.id,
        fileHash,
      });
      let inserted = 0;
      for (const row of plan.pendingRows) {
        insertRecord({
          datasetId,
          versionId: version.id,
          sheetName: plan.sheetName,
          rowNum: row.rowNum,
          payload: row.payload,
          stdCategory: subtype.category || 'norm',
        });
        inserted += 1;
      }
      results.push({
        sheetName: plan.sheetName,
        status: 'success',
        message:
          `导入成功：共 ${inserted} 行${formatIgnoredColumnsNote(plan.ignoredColumns)}` +
          formatColumnConflictNote(plan.columnWarnings),
        ignoredColumns: plan.ignoredColumns,
        subtypeCode: version.subtypeCode,
        subtypeName: subtype.name,
        versionId: version.id,
        versionLabel: version.versionLabel,
        datasetId,
        recordCount: plan.pendingRows.length,
        inserted,
        updated: 0,
      });
    }
    saveDb();
  } catch (error) {
    clearVersionRecords(version.id);
    saveDb();
    throw error;
  }

  const success = results.filter((r) => r.status === 'success');
  const ignoredColumnSheets = success.filter((r) => (r.ignoredColumns || []).length);

  return {
    mode: 'bulk',
    fileName: sourceFileName,
    fileHash,
    sheets: results,
    summary: {
      success: success.length,
      failed: 0,
      skipped: 0,
      inserted: success.reduce((n, r) => n + (r.inserted || 0), 0),
      updated: 0,
      sheetsWithIgnoredColumns: ignoredColumnSheets.length,
      bulkAborted: false,
      columnConflictNotes: allColumnWarnings.size ? [...allColumnWarnings] : undefined,
    },
  };
}

function resolveBulkImportVersion(selectedVersionIds) {
  const bulkIds = selectedVersionIds.filter((id) => {
    const v = getSubtypeVersion(id);
    return v && isBulkImportVersion(v);
  });
  if (!bulkIds.length) return null;
  if (selectedVersionIds.length !== 1 || bulkIds.length !== 1) {
    throw new Error(`「${BULK_IMPORT_VERSION_SHEET_NAME}」版本只能单独选择一个，且勿与其他版本混选`);
  }
  const version = getSubtypeVersion(bulkIds[0]);
  if (version.status !== 'active') {
    throw new Error('所选全量导入版本未启用');
  }
  return version;
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

  const bulkVersion = resolveBulkImportVersion(selectedVersionIds);
  if (bulkVersion) {
    return importBulkWorkbook({
      sheets,
      version: bulkVersion,
      sourceFileName: fileName,
      fileHash,
      description: options.description || '',
    });
  }

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
    if (isBulkImportVersion(version)) {
      skipped.push({
        sheetName: sheet.sheetName,
        status: 'skipped',
        message: `版本「${version.versionLabel}」为全量导入，请在导入页单独勾选该版本并上传整本 Excel`,
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
  const ignoredColumnSheets = success.filter((r) => (r.ignoredColumns || []).length);

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
      sheetsWithIgnoredColumns: ignoredColumnSheets.length,
    },
  };
}
