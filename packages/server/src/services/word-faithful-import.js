/**
 * Word 原样显示：整本导入，块级索引 + 预览 HTML（无 Profile 切分、无表样/指标绑定）
 */
import crypto from 'crypto';
import { queryAll, queryOne, run, saveDb } from '../db/database.js';
import { readWordPartsFromDocx } from './docx-file.js';
import { extractWordBlocks } from './word-structure-extractor.js';
import { docCodeFromImportFileName } from './word-import-pipeline.js';
import { resolveImportSubtypeCode, ensureSubtypeVersionForImport } from './dataset-config.js';
import { resolveSubtypeCode } from '../config/system-subtypes.js';

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {import('./word-import-pipeline.js').WordBlock[]} blocks */
export function blocksToSearchUnits(blocks) {
  /** @type {Array<{ blockKind: string, text: string, tableIndex?: number, rowIndex?: number, colIndex?: number }>} */
  const units = [];
  let tableIndex = 0;

  for (const block of blocks || []) {
    if (block.meta?.skipInOutline) continue;

    if (block.blockKind === 'table' && block.meta?.rows?.length) {
      const rows = block.meta.rows;
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const text = String(rows[r][c] ?? '').trim();
          if (!text) continue;
          units.push({
            blockKind: 'table_cell',
            text,
            tableIndex,
            rowIndex: r,
            colIndex: c,
          });
        }
      }
      tableIndex += 1;
      continue;
    }

    const text = String(block.text ?? '').trim();
    if (!text) continue;
    units.push({
      blockKind: block.blockKind || 'paragraph',
      text,
    });
  }

  return units.map((unit, sortOrder) => ({ ...unit, sortOrder }));
}

export function buildPreviewHtml(units) {
  const parts = ['<div class="wf-doc">'];
  for (const unit of units) {
    const cls =
      unit.blockKind === 'heading'
        ? 'wf-heading'
        : unit.blockKind === 'table_cell'
          ? 'wf-table-cell'
          : 'wf-paragraph';
    parts.push(
      `<div data-wf-block="${unit.sortOrder}" class="wf-block ${cls}">${escapeHtml(unit.text)}</div>`
    );
  }
  parts.push('</div>');
  return parts.join('\n');
}

function mapDocumentRow(row) {
  return {
    id: Number(row.id),
    docCode: row.doc_code,
    docTitle: row.doc_title || '',
    versionLabel: row.version_label || '',
    moduleCode: row.module_code || '1104',
    subtypeCode: row.subtype_code || '',
    sourceFileName: row.source_file_name || '',
    fileHash: row.file_hash || '',
    blockCount: Number(row.block_count || 0),
    hasDocxFile: Boolean(row.docx_blob),
    importedAt: row.imported_at,
  };
}

function insertBlocks(documentId, units) {
  for (const unit of units) {
    run(
      `INSERT INTO word_faithful_blocks (
         document_id, sort_order, block_kind, text, table_index, row_index, col_index
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        documentId,
        unit.sortOrder,
        unit.blockKind,
        unit.text,
        unit.tableIndex ?? null,
        unit.rowIndex ?? null,
        unit.colIndex ?? null,
      ]
    );
  }
}

function findDocument(subtypeCode, docCode, versionLabel) {
  return queryOne(
    `SELECT * FROM word_faithful_documents
     WHERE subtype_code = ? AND doc_code = ? AND version_label = ?`,
    [subtypeCode, docCode, versionLabel]
  );
}

/**
 * @param {Buffer} buffer
 * @param {object} [options]
 */
export function importWordFaithfulDocument(buffer, options = {}) {
  const fileName = options.fileName || 'upload.docx';
  const moduleCode = String(options.moduleCode || '1104').trim();
  const subtypeCode = resolveImportSubtypeCode(options.subtypeCode, 'word_faithful', { moduleCode });
  const versionLabel = String(options.versionLabel || '').trim();
  ensureSubtypeVersionForImport(subtypeCode, versionLabel);

  const fileHash = hashBuffer(buffer);
  const { documentXml, numberingXml } = readWordPartsFromDocx(buffer);
  const blocks = extractWordBlocks(documentXml, { numberingXml, prependListNumbers: true });
  const units = blocksToSearchUnits(blocks);
  if (!units.length) {
    throw new Error('Word 中未解析到可索引的正文');
  }

  const previewHtml = buildPreviewHtml(units);
  const docxBlob = Buffer.from(buffer).toString('base64');
  const docCode = docCodeFromImportFileName(fileName);
  const docTitle = docCode;
  const resolvedSubtype = subtypeCode || resolveSubtypeCode('word_faithful', moduleCode);

  const existing = findDocument(resolvedSubtype, docCode, versionLabel);
  let documentId;
  let importAction = 'created';

  if (existing) {
    documentId = Number(existing.id);
    importAction = 'replaced';
    run('DELETE FROM word_faithful_blocks WHERE document_id = ?', [documentId]);
    run(
      `UPDATE word_faithful_documents
       SET doc_title = ?, module_code = ?, source_file_name = ?, file_hash = ?,
           docx_blob = ?, preview_html = ?, block_count = ?, imported_at = datetime('now')
       WHERE id = ?`,
      [docTitle, moduleCode, fileName, fileHash, docxBlob, previewHtml, units.length, documentId]
    );
  } else {
    run(
      `INSERT INTO word_faithful_documents (
         doc_code, doc_title, version_label, subtype_code, module_code,
         source_file_name, file_hash, docx_blob, preview_html, block_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docCode,
        docTitle,
        versionLabel,
        resolvedSubtype,
        moduleCode,
        fileName,
        fileHash,
        docxBlob,
        previewHtml,
        units.length,
      ]
    );
    documentId = Number(queryOne('SELECT last_insert_rowid() AS id').id);
  }

  insertBlocks(documentId, units);
  saveDb();

  return {
    ok: true,
    importAction,
    id: documentId,
    docCode,
    docTitle,
    versionLabel,
    moduleCode,
    subtypeCode: resolvedSubtype,
    blockCount: units.length,
    sourceFileName: fileName,
  };
}

export function listWordFaithfulDocuments({ moduleCode, subtypeCode } = {}) {
  let sql = `SELECT * FROM word_faithful_documents WHERE 1=1`;
  const params = [];
  if (moduleCode) {
    sql += ' AND module_code = ?';
    params.push(String(moduleCode).trim());
  }
  if (subtypeCode) {
    sql += ' AND subtype_code = ?';
    params.push(String(subtypeCode).trim());
  }
  sql += ' ORDER BY doc_code, version_label, id';
  return queryAll(sql, params).map(mapDocumentRow);
}

export function getWordFaithfulDocument(id) {
  const row = queryOne(`SELECT * FROM word_faithful_documents WHERE id = ?`, [Number(id)]);
  if (!row) return null;
  return {
    ...mapDocumentRow(row),
    previewHtml: row.preview_html || '',
  };
}

export function getWordFaithfulDocxBuffer(id) {
  const row = queryOne(`SELECT docx_blob, source_file_name FROM word_faithful_documents WHERE id = ?`, [
    Number(id),
  ]);
  if (!row?.docx_blob) return null;
  return {
    buffer: Buffer.from(String(row.docx_blob), 'base64'),
    fileName: row.source_file_name || 'document.docx',
  };
}

export function listWordFaithfulBlocks(documentId) {
  const id = Number(documentId);
  return queryAll(
    `SELECT id, sort_order, block_kind, text, table_index, row_index, col_index
     FROM word_faithful_blocks
     WHERE document_id = ?
     ORDER BY sort_order, id`,
    [id]
  ).map((row) => ({
    blockId: Number(row.id),
    sortOrder: Number(row.sort_order),
    blockKind: row.block_kind,
    text: row.text,
    tableIndex: row.table_index == null ? null : Number(row.table_index),
    rowIndex: row.row_index == null ? null : Number(row.row_index),
    colIndex: row.col_index == null ? null : Number(row.col_index),
  }));
}

export function deleteWordFaithfulDocument(id) {
  const docId = Number(id);
  if (!Number.isFinite(docId) || docId <= 0) throw new Error('无效的文档 id');
  const row = queryOne(`SELECT id FROM word_faithful_documents WHERE id = ?`, [docId]);
  if (!row) throw new Error('文档不存在');
  run('DELETE FROM word_faithful_blocks WHERE document_id = ?', [docId]);
  run('DELETE FROM word_faithful_documents WHERE id = ?', [docId]);
  saveDb();
  return { id: docId, deleted: true };
}
