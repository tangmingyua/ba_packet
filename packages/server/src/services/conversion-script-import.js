/**
 * 转1104 脚本导入（.sql / .txt，文件名解析表号与版本）
 */
import crypto from 'crypto';
import path from 'path';
import { queryAll, queryOne, run, saveDb } from '../db/database.js';
import { listModules } from './dataset-config.js';

/** 文件名无 _版本 时的默认版本（与表样一致） */
export const CONVERSION_SCRIPT_LATEST_VERSION = 'LASTEST';

const REPORT_CODE_RE = '([A-Za-z][A-Za-z0-9]*)';
const ALLOWED_EXT = new Set(['.sql', '.txt']);

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function normalizeConversionScriptModuleCode(code) {
  const normalized = String(code ?? '').trim();
  if (!normalized) return '';
  if (!listModules().some((m) => m.code === normalized)) {
    throw new Error(`未知模块：${normalized}（请先在子类配置中添加主类）`);
  }
  return normalized;
}

/**
 * 从文件名解析 1104 表号与版本
 * @param {string} fileName 如 G0100_231.sql、G0100.txt
 */
export function parseConversionScriptFileName(fileName) {
  const name = String(fileName || '').trim();
  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error('仅支持 .sql 或 .txt 文件');
  }

  const base = path.basename(name, ext);
  const under = base.match(new RegExp(`^${REPORT_CODE_RE}_(\\d+)$`, 'i'));
  if (under) {
    return {
      reportCode: under[1].toUpperCase(),
      versionLabel: under[2],
      sourceFileName: path.basename(name),
    };
  }

  const codeOnly = base.match(new RegExp(`^${REPORT_CODE_RE}$`, 'i'));
  if (codeOnly) {
    return {
      reportCode: codeOnly[1].toUpperCase(),
      versionLabel: CONVERSION_SCRIPT_LATEST_VERSION,
      sourceFileName: path.basename(name),
    };
  }

  throw new Error(`文件名须为「表号_版本${ext}」或「表号${ext}」，如 G0100_231.sql、G0100.sql`);
}

function mapConversionScriptRow(row) {
  return {
    id: Number(row.id),
    moduleCode: row.module_code,
    reportCode: row.report_code,
    versionLabel: row.version_label,
    sourceFileName: row.source_file_name,
    importedAt: row.imported_at,
  };
}

export function listConversionScripts({ moduleCode, reportCode } = {}) {
  let sql = `SELECT id, module_code, report_code, version_label, source_file_name, imported_at
             FROM conversion_scripts WHERE 1=1`;
  const params = [];

  if (moduleCode) {
    sql += ' AND module_code = ?';
    params.push(String(moduleCode).trim());
  }

  const code = String(reportCode ?? '').trim().toUpperCase();
  if (code) {
    sql += ' AND UPPER(report_code) LIKE ?';
    params.push(`%${code}%`);
  }

  sql += ' ORDER BY report_code, version_label, imported_at DESC';
  return queryAll(sql, params).map(mapConversionScriptRow);
}

export function getConversionScript(id) {
  const row = queryOne('SELECT * FROM conversion_scripts WHERE id = ?', [Number(id)]);
  if (!row) return null;
  return {
    ...mapConversionScriptRow(row),
    scriptText: row.script_text,
    fileHash: row.file_hash,
  };
}

export function deleteConversionScript(id) {
  const numId = Number(id);
  const existing = getConversionScript(numId);
  if (!existing) throw new Error('脚本不存在');
  run('DELETE FROM conversion_scripts WHERE id = ?', [numId]);
  saveDb();
  return { ok: true, ...existing };
}

export function importConversionScript(buffer, options = {}) {
  const moduleCode = normalizeConversionScriptModuleCode(options.moduleCode);
  if (!moduleCode) throw new Error('请选择模块');

  const fileName = options.fileName || 'upload.sql';
  const meta = parseConversionScriptFileName(fileName);
  const scriptText = buffer.toString('utf8');
  if (!String(scriptText).trim()) {
    throw new Error('文件内容为空');
  }

  const fileHash = hashBuffer(buffer);
  const existing = queryOne(
    `SELECT id FROM conversion_scripts
     WHERE module_code = ? AND report_code = ? AND version_label = ?`,
    [moduleCode, meta.reportCode, meta.versionLabel]
  );
  const importAction = existing ? 'replaced' : 'created';

  if (existing) {
    run('DELETE FROM conversion_scripts WHERE id = ?', [existing.id]);
  }

  run(
    `INSERT INTO conversion_scripts (
       module_code, report_code, version_label, source_file_name, file_hash, script_text
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [moduleCode, meta.reportCode, meta.versionLabel, meta.sourceFileName, fileHash, scriptText]
  );

  const inserted = queryOne('SELECT last_insert_rowid() AS id');
  saveDb();

  const actionLabel = importAction === 'replaced' ? '覆盖' : '新增';
  return {
    ok: true,
    id: Number(inserted.id),
    moduleCode,
    reportCode: meta.reportCode,
    versionLabel: meta.versionLabel,
    sourceFileName: meta.sourceFileName,
    importAction,
    message: `${actionLabel}：${meta.reportCode} / 版本 ${meta.versionLabel}`,
  };
}
