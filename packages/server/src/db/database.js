/**
 * SQLite 数据库层（基于 sql.js，内存 + 文件持久化）
 * 新模型：子类 / 版本 / 映射 / datasets / data_records
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MATERIAL_MODULES, MATERIAL_SUBTYPES } from '../config/import-catalog-static.js';
import { SEED_SUBTYPES } from '../config/system-subtypes.js';
import { STANDARD_FIELD_SEEDS } from './seed-standard-fields.js';
import { backfillFormTemplateCells } from '../services/form-template-cells.js';
import { backfillFormTemplateLayouts } from '../services/form-template-layout.js';
import {
  decryptDbBuffer,
  encryptDbBuffer,
  isEncryptedDbFile,
  isPlainSqliteFile,
  loadSeedPlainBuffer,
} from './db-crypto.js';
import { ensureDbKeyHex, getDbKeyHexSync, isPlainDbMode } from './db-key.js';
import { resolvePackagedFile } from '../runtime-paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** sql.js 引擎实例（单例） */
let SQL = null;
/** 当前打开的数据库连接 */
let db = null;

const LEGACY_TABLES = [
  'material_subtype_field',
  'material_field_catalog',
  'material_subtype_config',
  'material_file_meta',
  'ybt_faq',
  'ybt_zl',
  'report_config',
  'import_log',
];

/**
 * 查找 sql-wasm.wasm 文件路径
 * 兼容 monorepo 根目录与 server 包内两种 node_modules 布局
 */
function resolveWasmPath() {
  const packaged = resolvePackagedFile('sql-wasm.wasm');
  const candidates = [
    packaged,
    path.join(__dirname, '../../../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join(__dirname, '../../../../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join(process.env.BA_RESOURCES_PATH || '', 'node_modules/sql.js/dist/sql-wasm.wasm'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, '../../../node_modules/sql.js/dist/sql-wasm.wasm');
}

/** 获取数据库文件路径，测试时可通过 BA_DB_PATH 覆盖 */
export function getDbPath() {
  if (process.env.BA_DB_PATH) {
    return process.env.BA_DB_PATH;
  }
  return path.join(__dirname, '../../data/catalog.db');
}

/** 懒加载 sql.js WASM 引擎 */
async function loadSqlEngine() {
  if (SQL) return SQL;
  const wasmPath = resolveWasmPath();
  SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });
  return SQL;
}

/** 将内存数据库导出写入磁盘（默认 AES-256-GCM 加密） */
export function saveDb() {
  if (!db) return;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const data = Buffer.from(db.export());
  if (data.length === 0) {
    console.warn('[db] 跳过写入空数据库导出');
    return;
  }

  if (isPlainDbMode()) {
    fs.writeFileSync(dbPath, data);
    return;
  }

  const keyHex = getDbKeyHexSync();
  fs.writeFileSync(dbPath, encryptDbBuffer(data, keyHex));
}

function readDbFileBuffer(dbPath) {
  const fileBuffer = fs.readFileSync(dbPath);

  if (isPlainDbMode()) {
    return fileBuffer;
  }

  const keyHex = getDbKeyHexSync();

  if (isEncryptedDbFile(fileBuffer)) {
    return decryptDbBuffer(fileBuffer, keyHex);
  }

  if (isPlainSqliteFile(fileBuffer)) {
    return fileBuffer;
  }

  throw new Error(`无法识别的数据库文件: ${dbPath}`);
}

function isUsableDbFile(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  if (isPlainDbMode()) {
    return isPlainSqliteFile(buffer) || isEncryptedDbFile(buffer);
  }
  return isEncryptedDbFile(buffer) || isPlainSqliteFile(buffer);
}

function resolveSeedPath() {
  if (process.env.BA_SEED_PATH && fs.existsSync(process.env.BA_SEED_PATH)) {
    return process.env.BA_SEED_PATH;
  }
  return '';
}

function bootstrapFromSeed(engine) {
  const seedPath = resolveSeedPath();
  if (!seedPath) return false;

  const seedBuffer = fs.readFileSync(seedPath);
  const plainBuffer = loadSeedPlainBuffer(seedPath, seedBuffer);
  db = new engine.Database(plainBuffer);
  db.run('PRAGMA foreign_keys = ON');
  ensureDatasetModelSchema();
  dropLegacyTables();
  return true;
}

/**
 * 初始化数据库连接
 * @param {object} options - fresh: true 时删除旧库重建
 */
export async function initDb({ fresh = false } = {}) {
  if (db && !fresh) return db;

  await ensureDbKeyHex();

  const engine = await loadSqlEngine();
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  if (fresh && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  if (!fs.existsSync(dbPath)) {
    if (bootstrapFromSeed(engine)) {
      return db;
    }
    db = new engine.Database();
  } else {
    const rawOnDisk = fs.readFileSync(dbPath);
    if (!isUsableDbFile(rawOnDisk)) {
      if (rawOnDisk.length > 0) {
        console.warn(`[db] 无法识别的数据库文件，将重建: ${dbPath}`);
      } else {
        console.warn(`[db] 数据库文件为空，将重建: ${dbPath}`);
      }
      fs.unlinkSync(dbPath);
      if (bootstrapFromSeed(engine)) {
        return db;
      }
      db = new engine.Database();
    } else {
      const fileBuffer = readDbFileBuffer(dbPath);
      db = new engine.Database(fileBuffer);
      if (!isPlainDbMode() && isPlainSqliteFile(rawOnDisk)) {
        saveDb();
      }
    }
  }

  db.run('PRAGMA foreign_keys = ON');
  ensureDatasetModelSchema();
  dropLegacyTables();
  return db;
}

/** 移除旧模型表（ybt_zl / material_* 等），不影响新模型 */
function dropLegacyTables() {
  for (const table of LEGACY_TABLES) {
    run(`DROP TABLE IF EXISTS ${table}`);
  }
  saveDb();
}

/** 子类 / 记录：规范(norm) vs 答疑(qa) 标签列（已有库增量迁移） */
function ensureCategoryColumns() {
  const subtypeCols = queryAll('PRAGMA table_info(subtypes)');
  if (!subtypeCols.some((c) => c.name === 'category')) {
    run(`ALTER TABLE subtypes ADD COLUMN category TEXT NOT NULL DEFAULT 'norm'`);
  }

  for (const st of MATERIAL_SUBTYPES) {
    const cat = st.categoryCode === 'FAQ' ? 'qa' : 'norm';
    run(`UPDATE subtypes SET category = ? WHERE code = ?`, [cat, st.code]);
  }
  run(
    `UPDATE subtypes SET category = 'qa'
     WHERE category = 'norm' AND (code LIKE '%_FAQ' OR code LIKE '%FAQ%')`
  );

  const recordCols = queryAll('PRAGMA table_info(data_records)');
  if (!recordCols.some((c) => c.name === 'std_category')) {
    run(`ALTER TABLE data_records ADD COLUMN std_category TEXT NOT NULL DEFAULT 'norm'`);
  }
  run(`
    UPDATE data_records SET std_category = COALESCE(
      (SELECT s.category FROM subtype_versions sv
       JOIN subtypes s ON s.code = sv.subtype_code
       WHERE sv.id = data_records.subtype_version_id),
      'norm'
    )
    WHERE std_category IS NULL OR std_category = '' OR std_category = 'norm'
  `);

  run(`CREATE INDEX IF NOT EXISTS idx_data_records_category ON data_records(std_category)`);
}

/** field_mappings：是否默认在搜索结果中展示 */
function ensureFieldMappingDefaultDisplayColumn() {
  const cols = queryAll('PRAGMA table_info(field_mappings)');
  if (cols.some((c) => c.name === 'is_default_display')) return;

  run(`ALTER TABLE field_mappings ADD COLUMN is_default_display INTEGER NOT NULL DEFAULT 0`);

  const primaryStdFields = [
    'data_item',
    'table_name',
    'table_name_main',
    'data_element_desc',
    'remark',
    'question_desc',
    'question_type',
    'question_suggestion',
    'indicator_name',
    'key_indicator_name',
  ];
  for (const code of primaryStdFields) {
    run(`UPDATE field_mappings SET is_default_display = 1 WHERE standard_field = ?`, [code]);
  }
}

/** field_mappings：是否作为查询页默认筛选列（空值不生效，仅预填筛选 UI） */
function ensureFieldMappingDefaultFilterColumn() {
  const cols = queryAll('PRAGMA table_info(field_mappings)');
  if (cols.some((c) => c.name === 'is_default_filter')) return;
  run(`ALTER TABLE field_mappings ADD COLUMN is_default_filter INTEGER NOT NULL DEFAULT 0`);
}

/** field_mappings：空关键词浏览时在聚合索引页展示并组合去重 */
function ensureFieldMappingAggregateDisplayColumn() {
  const cols = queryAll('PRAGMA table_info(field_mappings)');
  if (cols.some((c) => c.name === 'is_aggregate_display')) return;
  run(`ALTER TABLE field_mappings ADD COLUMN is_aggregate_display INTEGER NOT NULL DEFAULT 0`);
}

/** 主类（modules）+ 子类归属 module_code */
function ensureModuleSchema() {
  for (const m of MATERIAL_MODULES) {
    run(
      `INSERT OR IGNORE INTO modules (code, name, sort_order, enabled) VALUES (?, ?, ?, 1)`,
      [m.code, m.name, m.sortOrder ?? 0]
    );
  }

  const subtypeCols = queryAll('PRAGMA table_info(subtypes)');
  if (!subtypeCols.some((c) => c.name === 'module_code')) {
    run(`ALTER TABLE subtypes ADD COLUMN module_code TEXT NOT NULL DEFAULT 'YBT'`);
  }

  const versionCols = queryAll('PRAGMA table_info(subtype_versions)');
  if (versionCols.length && !versionCols.some((c) => c.name === 'version_date')) {
    run(`ALTER TABLE subtype_versions ADD COLUMN version_date TEXT NOT NULL DEFAULT ''`);
  }

  for (const st of MATERIAL_SUBTYPES) {
    const moduleCode = st.moduleCode || 'YBT';
    run(`UPDATE subtypes SET module_code = ? WHERE code = ?`, [moduleCode, st.code]);
  }
  run(
    `UPDATE subtypes SET module_code = 'YBT'
     WHERE module_code IS NULL OR module_code = ''`
  );

  run(`INSERT OR IGNORE INTO modules (code, name, sort_order, enabled) VALUES ('IMAS', 'IMAS', 3, 1)`);
  for (const table of ['form_templates', 'documents']) {
    const cols = queryAll(`PRAGMA table_info(${table})`);
    if (cols.some((c) => c.name === 'module_code')) {
      run(`UPDATE ${table} SET module_code = 'IMAS' WHERE module_code = 'IMAS-NR'`);
    }
  }
}

function resolveSchemaPath() {
  const packaged = resolvePackagedFile('dataset-schema.sql');
  if (packaged) return packaged;
  return path.join(__dirname, 'dataset-schema.sql');
}

/** document_nodes：指标完整序号（25a、12.1a 等） */
function ensureDocumentNodeIndicatorKeyColumn() {
  const cols = queryAll('PRAGMA table_info(document_nodes)');
  if (!cols.length) return;
  if (!cols.some((c) => c.name === 'indicator_key')) {
    run(`ALTER TABLE document_nodes ADD COLUMN indicator_key TEXT`);
  }
  if (!cols.some((c) => c.name === 'meta_json')) {
    run(`ALTER TABLE document_nodes ADD COLUMN meta_json TEXT`);
  }
  run(
    `CREATE INDEX IF NOT EXISTS idx_document_nodes_indicator_key ON document_nodes(document_id, indicator_key)`
  );
}

/** form_templates：导入时预计算的展示布局（方案 B） */
function ensureFormTemplateLayoutColumn() {
  const cols = queryAll('PRAGMA table_info(form_templates)');
  if (!cols.length) return;
  if (!cols.some((c) => c.name === 'layout_json')) {
    run(`ALTER TABLE form_templates ADD COLUMN layout_json TEXT NOT NULL DEFAULT '{}'`);
  }
}

/** form_templates：Excel 原生列宽 / 行高 */
function ensureFormTemplateDimensionColumns() {
  const cols = queryAll('PRAGMA table_info(form_templates)');
  if (!cols.length) return;
  if (!cols.some((c) => c.name === 'col_widths_json')) {
    run(`ALTER TABLE form_templates ADD COLUMN col_widths_json TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!cols.some((c) => c.name === 'row_heights_json')) {
    run(`ALTER TABLE form_templates ADD COLUMN row_heights_json TEXT NOT NULL DEFAULT '[]'`);
  }
}

/** form_templates：Sheet 在工作簿中的原始顺序 */
function ensureFormTemplateSheetIndexColumn() {
  const cols = queryAll('PRAGMA table_info(form_templates)');
  if (!cols.length) return;
  if (!cols.some((c) => c.name === 'sheet_index')) {
    run(`ALTER TABLE form_templates ADD COLUMN sheet_index INTEGER NOT NULL DEFAULT 0`);
  }
}

/** form_templates：导入时选择的模块 */
function ensureFormTemplateModuleColumn() {
  const cols = queryAll('PRAGMA table_info(form_templates)');
  if (!cols.length) return;
  if (!cols.some((c) => c.name === 'module_code')) {
    run(`ALTER TABLE form_templates ADD COLUMN module_code TEXT NOT NULL DEFAULT '1104'`);
  }
}

/** documents / word_sources：Word 结构层导入扩展列 */
function ensureWordImportSchema() {
  const docCols = queryAll('PRAGMA table_info(documents)');
  if (docCols.length) {
    if (!docCols.some((c) => c.name === 'source_id')) {
      run(`ALTER TABLE documents ADD COLUMN source_id INTEGER`);
    }
    if (!docCols.some((c) => c.name === 'block_start')) {
      run(`ALTER TABLE documents ADD COLUMN block_start INTEGER`);
    }
    if (!docCols.some((c) => c.name === 'block_end')) {
      run(`ALTER TABLE documents ADD COLUMN block_end INTEGER`);
    }
    if (!docCols.some((c) => c.name === 'split_mode')) {
      run(`ALTER TABLE documents ADD COLUMN split_mode TEXT`);
    }
  }
}

/** subtypes：存储形态 storage_kind（excel / form_template / document / script / code_value） */
function ensureStorageKindColumn() {
  const subtypeCols = queryAll('PRAGMA table_info(subtypes)');
  if (!subtypeCols.some((c) => c.name === 'storage_kind')) {
    run(`ALTER TABLE subtypes ADD COLUMN storage_kind TEXT NOT NULL DEFAULT 'excel'`);
  }
  run(`UPDATE subtypes SET storage_kind = 'excel' WHERE storage_kind IS NULL OR storage_kind = ''`);
}

/** 种子子类（示例子类，仅全新空库首次初始化时写入） */
function ensureSeedSubtypes(freshInstall = false) {
  if (!freshInstall) return;
  for (const st of SEED_SUBTYPES) {
    run(
      `INSERT OR IGNORE INTO subtypes (code, name, enabled, sort_order, category, module_code, storage_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        st.code,
        st.name,
        st.importEnabled ? 1 : 0,
        st.sortOrder,
        st.category,
        st.moduleCode,
        st.storageKind,
      ]
    );
  }
}

/** 查询页主类 Tab 显示顺序（sort_order 0 起） */
const MODULE_TAB_DISPLAY_ORDER = [
  { code: 'YBT', name: '一表通' },
  { code: 'EAST', name: 'EAST' },
  { code: 'FIN_BASIC_DATA', name: '金数' },
  { code: '1104', name: '1104' },
  { code: 'DJZ', name: '大集中' },
  { code: 'CREDIT', name: '征信' },
  { code: 'AML', name: '反洗钱' },
  { code: 'AML_SIT_INSPEC', name: '反洗钱现场检查' },
  { code: 'RCPMIS', name: 'RCPMIS' },
  { code: 'SAFE', name: 'SAFE' },
  { code: 'IMAS', name: '利率监测' },
  { code: 'IMAS_NR', name: '利率监测NR' },
  { code: 'PISA', name: 'PISA' },
];

function ensureModuleDisplayOrder() {
  MODULE_TAB_DISPLAY_ORDER.forEach(({ code, name }, index) => {
    run(`INSERT OR IGNORE INTO modules (code, name, sort_order, enabled) VALUES (?, ?, ?, 1)`, [
      code,
      name,
      index,
    ]);
    run(`UPDATE modules SET sort_order = ?, name = ? WHERE code = ?`, [index, name, code]);
  });
}

/** 子类配置版本 + 关联 data_records.std_version */
function renameSubtypeVersionCatalog(subtypeCode, fromLabel, toLabel) {
  const svRow = queryOne(
    `SELECT id FROM subtype_versions WHERE subtype_code = ? AND version_label = ?`,
    [subtypeCode, fromLabel]
  );
  if (!svRow) return;
  const svConflict = queryOne(
    `SELECT id FROM subtype_versions WHERE subtype_code = ? AND version_label = ?`,
    [subtypeCode, toLabel]
  );
  if (svConflict) return;
  run(`UPDATE subtype_versions SET version_label = ? WHERE id = ?`, [toLabel, svRow.id]);
  run(
    `UPDATE data_records SET std_version = ?
     WHERE subtype_version_id = ? AND (std_version = ? OR std_version IS NULL OR std_version = '')`,
    [toLabel, svRow.id, fromLabel]
  );
}

function renameFormTemplateVersionLabels(subtypeCode, fromLabel, toLabel) {
  const hasFrom = queryOne(
    `SELECT 1 AS ok FROM form_templates WHERE subtype_code = ? AND version_label = ? LIMIT 1`,
    [subtypeCode, fromLabel]
  );
  if (!hasFrom) return;

  const dupes = queryAll(
    `SELECT old.id
     FROM form_templates old
     INNER JOIN form_templates newer
       ON newer.report_code = old.report_code AND newer.version_label = ?
     WHERE old.subtype_code = ? AND old.version_label = ?`,
    [toLabel, subtypeCode, fromLabel]
  );
  for (const d of dupes) {
    run('DELETE FROM form_template_cells WHERE template_id = ?', [d.id]);
    run('DELETE FROM form_templates WHERE id = ?', [d.id]);
  }

  run(
    `UPDATE form_templates SET version_label = ?
     WHERE subtype_code = ? AND version_label = ?`,
    [toLabel, subtypeCode, fromLabel]
  );
}

function renameDocumentVersionLabels(subtypeCode, fromLabel, toLabel) {
  const hasFrom = queryOne(
    `SELECT 1 AS ok FROM documents WHERE subtype_code = ? AND version_label = ? LIMIT 1`,
    [subtypeCode, fromLabel]
  );
  if (!hasFrom) return;

  const mappingDupes = queryAll(
    `SELECT old.report_code
     FROM report_doc_mapping old
     INNER JOIN report_doc_mapping newer
       ON newer.report_code = old.report_code AND newer.version_label = ?
     INNER JOIN documents d ON d.id = old.document_id AND d.subtype_code = ?
     WHERE old.version_label = ?`,
    [toLabel, subtypeCode, fromLabel]
  );
  for (const row of mappingDupes) {
    run(`DELETE FROM report_doc_mapping WHERE report_code = ? AND version_label = ?`, [
      row.report_code,
      fromLabel,
    ]);
  }

  run(
    `UPDATE report_doc_mapping
     SET version_label = ?
     WHERE version_label = ?
       AND document_id IN (
         SELECT id FROM documents WHERE subtype_code = ? AND version_label = ?
       )`,
    [toLabel, fromLabel, subtypeCode, fromLabel]
  );

  const docDupes = queryAll(
    `SELECT old.id
     FROM documents old
     INNER JOIN documents newer
       ON newer.doc_code = old.doc_code AND newer.version_label = ?
     WHERE old.subtype_code = ? AND old.version_label = ?`,
    [toLabel, subtypeCode, fromLabel]
  );
  for (const d of docDupes) {
    run('DELETE FROM document_nodes WHERE document_id = ?', [d.id]);
    run('DELETE FROM report_doc_mapping WHERE document_id = ?', [d.id]);
    run('DELETE FROM documents WHERE id = ?', [d.id]);
  }

  run(
    `UPDATE documents SET version_label = ?
     WHERE subtype_code = ? AND version_label = ?`,
    [toLabel, subtypeCode, fromLabel]
  );
}

/** 大集中采集规范、1104 表样/填报说明：V1.0 → V2026（与大集中一致） */
function backfillMaterialVersionLabelV2026() {
  const fromLabel = 'V1.0';
  const toLabel = 'V2026';
  for (const subtypeCode of ['DJZ_COLLECT_REG', '1104_FORM_TEMPLATE', '1104_FILL_INSTRUCTION']) {
    renameSubtypeVersionCatalog(subtypeCode, fromLabel, toLabel);
  }
  renameFormTemplateVersionLabels('DJZ_COLLECT_REG', fromLabel, toLabel);
  renameFormTemplateVersionLabels('1104_FORM_TEMPLATE', fromLabel, toLabel);
  renameDocumentVersionLabels('1104_FILL_INSTRUCTION', fromLabel, toLabel);
}

/** 业务子类标签/名称修正（存量库迁移） */
function backfillSubtypeCategories() {
  run(`UPDATE subtypes SET category = 'norm' WHERE code = 'suspicious_trn' AND category = 'qa'`);
  run(`UPDATE subtypes SET name = '个人征信表头定义' WHERE code = 'header_definition' AND name = '表头定义'`);
  run(`UPDATE subtypes SET name = '表样' WHERE code = '1104_FORM_TEMPLATE' AND name IN ('1104 表样', '1104表样')`);
  run(`UPDATE subtypes SET name = '填报说明' WHERE code = '1104_FILL_INSTRUCTION' AND name IN ('1104 填报说明', '1104填报说明')`);
  run(`UPDATE subtypes SET category = 'composite' WHERE category IN ('changelog', 'to1104')`);
  run(
    `INSERT OR IGNORE INTO modules (code, name, sort_order, enabled) VALUES ('AML_SIT_INSPEC', '反洗钱现场检查', 99, 1)`
  );
  run(
    `UPDATE subtypes SET module_code = 'AML_SIT_INSPEC' WHERE code = 'AML_SITE_INSP' AND module_code = 'AML'`
  );
  ensureModuleDisplayOrder();
  backfillMaterialVersionLabelV2026();
  run(`
    UPDATE data_records
    SET std_category = 'norm'
    WHERE std_category = 'qa'
      AND subtype_version_id IN (
        SELECT id FROM subtype_versions WHERE subtype_code = 'suspicious_trn'
      )
  `);
}

/** 移除 EAST 下误建的表样子类及其表样数据（一次性存量清理） */
function removeEastFormTemplateSubtypes() {
  const rows = queryAll(
    `SELECT code FROM subtypes
     WHERE storage_kind = 'form_template'
       AND (module_code = 'EAST' OR code IN ('EAST_FORM_TEMPLATE', 'EAST_FORM_TPL'))`
  );
  if (!rows.length) return;
  for (const { code } of rows) {
    const templates = queryAll('SELECT id FROM form_templates WHERE subtype_code = ?', [code]);
    for (const t of templates) {
      run('DELETE FROM form_template_cells WHERE template_id = ?', [t.id]);
      run('DELETE FROM form_templates WHERE id = ?', [t.id]);
    }
    run('DELETE FROM subtypes WHERE code = ?', [code]);
    console.log(`[db] 已移除 EAST 表样子类：${code}（表样 ${templates.length} 条）`);
  }
}

/** 启动时仅记录「表样子类挂接异常」，不删除业务数据（避免重启误清 catalog） */
function warnOrphanFormTemplates() {
  const orphans = queryAll(
    `
    SELECT ft.id, ft.report_code, ft.version_label, ft.subtype_code, ft.module_code
    FROM form_templates ft
    LEFT JOIN subtypes s ON s.code = ft.subtype_code
      AND s.enabled = 1
      AND s.storage_kind = 'form_template'
      AND s.module_code = ft.module_code
    WHERE s.code IS NULL
    `
  );
  if (!orphans.length) return;
  const sample = orphans
    .slice(0, 5)
    .map((r) => `${r.report_code}/${r.version_label}(subtype=${r.subtype_code})`)
    .join(', ');
  console.warn(
    `[db] 发现 ${orphans.length} 条表样未挂到有效表样子类（不会自动删除）。` +
      ` 示例: ${sample}${orphans.length > 5 ? '…' : ''}。` +
      ` 请在「子类配置」补全/启用子类，或手动删除多余表样。`
  );
}

/** 业务表挂接 subtype_code 并回填历史数据 */
function ensureSubtypeCodeColumns() {
  const tables = [
    { table: 'form_templates', suffix: '_FORM_TEMPLATE' },
    { table: 'documents', suffix: '_FILL_INSTRUCTION' },
  ];

  for (const { table, suffix } of tables) {
    const cols = queryAll(`PRAGMA table_info(${table})`);
    if (!cols.length) continue;
    if (!cols.some((c) => c.name === 'subtype_code')) {
      run(`ALTER TABLE ${table} ADD COLUMN subtype_code TEXT`);
    }
    run(
      `UPDATE ${table} SET subtype_code = module_code || ?
       WHERE subtype_code IS NULL OR subtype_code = ''`,
      [suffix]
    );
  }

  const scriptCols = queryAll('PRAGMA table_info(conversion_scripts)');
  if (scriptCols.length) {
    if (!scriptCols.some((c) => c.name === 'subtype_code')) {
      run(`ALTER TABLE conversion_scripts ADD COLUMN subtype_code TEXT`);
    }
    run(
      `UPDATE conversion_scripts SET subtype_code = 'CONVERSION_SCRIPT'
       WHERE subtype_code IS NULL OR subtype_code = ''`
    );
  }

  const mcvCols = queryAll('PRAGMA table_info(module_code_values)');
  if (mcvCols.length) {
    if (!mcvCols.some((c) => c.name === 'subtype_code')) {
      run(`ALTER TABLE module_code_values ADD COLUMN subtype_code TEXT`);
    }
    run(
      `UPDATE module_code_values SET subtype_code = module_code || '_CODE_VALUE'
       WHERE subtype_code IS NULL OR subtype_code = ''`
    );
  }
}

/** 脚本唯一键含 subtype_code，允许多个子类各存同表号版本 */
function ensureConversionScriptsUniqueBySubtype() {
  const tableRow = queryOne(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'conversion_scripts'`
  );
  const ddl = String(tableRow?.sql || '');
  if (!ddl) return;
  if (/UNIQUE\s*\(\s*subtype_code/i.test(ddl)) return;

  run(
    `CREATE TABLE conversion_scripts_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subtype_code TEXT NOT NULL DEFAULT '',
      module_code TEXT NOT NULL,
      report_code TEXT NOT NULL,
      version_label TEXT NOT NULL,
      source_file_name TEXT NOT NULL,
      file_hash TEXT,
      script_text TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (subtype_code, module_code, report_code, version_label)
    )`
  );
  run(
    `
    INSERT INTO conversion_scripts_migrated (
      id, subtype_code, module_code, report_code, version_label,
      source_file_name, file_hash, script_text, imported_at
    )
    SELECT id,
      COALESCE(NULLIF(TRIM(subtype_code), ''), 'CONVERSION_SCRIPT'),
      module_code, report_code, version_label,
      source_file_name, file_hash, script_text, imported_at
    FROM conversion_scripts
    `
  );
  run('DROP TABLE conversion_scripts');
  run('ALTER TABLE conversion_scripts_migrated RENAME TO conversion_scripts');
  run(
    'CREATE INDEX IF NOT EXISTS idx_conversion_scripts_report ON conversion_scripts(report_code)'
  );
  run(
    'CREATE INDEX IF NOT EXISTS idx_conversion_scripts_module ON conversion_scripts(module_code)'
  );
  run(
    'CREATE INDEX IF NOT EXISTS idx_conversion_scripts_subtype ON conversion_scripts(subtype_code)'
  );
}

/** 新模型：子类版本 / 映射 / datasets / data_records */
function ensureDatasetModelSchema() {
  const schemaPath = resolveSchemaPath();
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  // 已有库可能缺 indicator_key，须先于 schema 中的索引语句补齐
  ensureDocumentNodeIndicatorKeyColumn();
  ensureFormTemplateLayoutColumn();
  ensureFormTemplateDimensionColumns();
  ensureFormTemplateModuleColumn();
  ensureFormTemplateSheetIndexColumn();
  ensureWordImportSchema();
  db.run(schema);

  ensureModuleSchema();
  ensureStorageKindColumn();
  ensureCategoryColumns();
  ensureFieldMappingDefaultDisplayColumn();
  ensureFieldMappingDefaultFilterColumn();
  ensureFieldMappingAggregateDisplayColumn();
  ensureDocumentNodeIndicatorKeyColumn();
  ensureFormTemplateLayoutColumn();
  ensureFormTemplateDimensionColumns();
  ensureFormTemplateModuleColumn();
  ensureFormTemplateSheetIndexColumn();
  ensureWordImportSchema();
  backfillFormTemplateCells();
  backfillFormTemplateLayouts({ queryAll, run, saveDb });

  for (const f of STANDARD_FIELD_SEEDS) {
    run(
      `INSERT OR IGNORE INTO standard_fields (code, label, is_system, sort_order) VALUES (?, ?, ?, ?)`,
      [f.code, f.label, f.isSystem ? 1 : 0, f.sortOrder]
    );
  }

  const subtypeCount = Number(queryOne('SELECT COUNT(*) AS c FROM subtypes')?.c || 0);
  const freshInstall = subtypeCount === 0;
  if (freshInstall) {
    MATERIAL_SUBTYPES.forEach((st, index) => {
      const category = st.categoryCode === 'FAQ' ? 'qa' : 'norm';
      const moduleCode = st.moduleCode || 'YBT';
      run(
        `INSERT INTO subtypes (code, name, enabled, sort_order, category, module_code, storage_kind) VALUES (?, ?, ?, ?, ?, ?, 'excel')`,
        [st.code, st.name, st.importEnabled ? 1 : 0, index, category, moduleCode]
      );
    });
  }
  ensureSeedSubtypes(freshInstall);
  backfillSubtypeCategories();
  removeEastFormTemplateSubtypes();
  warnOrphanFormTemplates();
  ensureSubtypeCodeColumns();
  ensureConversionScriptsUniqueBySubtype();
  saveDb();
}

/** 测试专用：删除库文件并重新初始化 */
export async function resetDbForTests() {
  closeDb();
  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  return initDb({ fresh: true });
}

/** 获取当前数据库实例，未初始化时抛错 */
export function getDb() {
  if (!db) {
    throw new Error('数据库尚未初始化，请先调用 initDb()');
  }
  return db;
}

/** 关闭连接并持久化 */
export function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

/** 执行查询，返回全部行 */
export function queryAll(sql, params = []) {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** 执行查询，返回首行或 null */
export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

/** 执行写操作（INSERT / UPDATE / DELETE / DDL） */
export function run(sql, params = []) {
  getDb().run(sql, params);
}
