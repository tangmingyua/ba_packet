/**
 * SQLite 数据库层（基于 sql.js，内存 + 文件持久化）
 * 新模型：子类 / 版本 / 映射 / datasets / data_records
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MATERIAL_MODULES, MATERIAL_SUBTYPES } from '../config/import-catalog-static.js';
import { STANDARD_FIELD_SEEDS } from './seed-standard-fields.js';
import { backfillFormTemplateCells } from '../services/form-template-cells.js';
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
  run(
    `CREATE INDEX IF NOT EXISTS idx_document_nodes_indicator_key ON document_nodes(document_id, indicator_key)`
  );
}

/** 新模型：子类版本 / 映射 / datasets / data_records */
function ensureDatasetModelSchema() {
  const schemaPath = resolveSchemaPath();
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  // 已有库可能缺 indicator_key，须先于 schema 中的索引语句补齐
  ensureDocumentNodeIndicatorKeyColumn();
  db.run(schema);

  ensureModuleSchema();
  ensureCategoryColumns();
  ensureFieldMappingDefaultDisplayColumn();
  ensureDocumentNodeIndicatorKeyColumn();
  backfillFormTemplateCells();

  for (const f of STANDARD_FIELD_SEEDS) {
    run(
      `INSERT OR IGNORE INTO standard_fields (code, label, is_system, sort_order) VALUES (?, ?, ?, ?)`,
      [f.code, f.label, f.isSystem ? 1 : 0, f.sortOrder]
    );
  }

  const subtypeCount = Number(queryOne('SELECT COUNT(*) AS c FROM subtypes')?.c || 0);
  if (subtypeCount === 0) {
    MATERIAL_SUBTYPES.forEach((st, index) => {
      const category = st.categoryCode === 'FAQ' ? 'qa' : 'norm';
      const moduleCode = st.moduleCode || 'YBT';
      run(
        `INSERT INTO subtypes (code, name, enabled, sort_order, category, module_code) VALUES (?, ?, ?, ?, ?, ?)`,
        [st.code, st.name, st.importEnabled ? 1 : 0, index, category, moduleCode]
      );
    });
  }
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
