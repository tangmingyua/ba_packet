/**
 * Word 原样显示搜索（两阶段：按文档聚合 + 单文档块命中）
 */
import { queryAll, queryOne } from '../db/database.js';

const DEFAULT_HITS_PER_DOCUMENT = 30;
const DEFAULT_MAX_DOCUMENTS = 50;

function matchesKeywordSql(keyword) {
  return `%${String(keyword).toLowerCase()}%`;
}

function matchesKeyword(text, keyword) {
  if (!text) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function snippet(text, keyword, maxLen = 100) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx < 0) return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…`;
  const pad = Math.max(0, Math.floor((maxLen - keyword.length) / 2));
  const start = Math.max(0, idx - pad);
  const end = Math.min(s.length, start + maxLen);
  let part = s.slice(start, end);
  if (start > 0) part = `…${part}`;
  if (end < s.length) part = `${part}…`;
  return part;
}

function mapDocumentRow(row) {
  return {
    id: Number(row.id),
    docCode: row.doc_code,
    docTitle: row.doc_title || '',
    blockCount: Number(row.block_count || 0),
  };
}

function buildDocumentMetaHits(documentRow, keyword) {
  const hits = [];
  const code = documentRow.doc_code || '';
  const title = documentRow.doc_title || '';

  if (matchesKeyword(code, keyword)) {
    hits.push({
      blockId: null,
      sortOrder: null,
      blockKind: 'document_code',
      text: code,
      snippet: snippet(code, keyword),
    });
  }

  if (title && matchesKeyword(title, keyword) && title.toLowerCase() !== code.toLowerCase()) {
    hits.push({
      blockId: null,
      sortOrder: null,
      blockKind: 'document_title',
      text: title,
      snippet: snippet(title, keyword),
    });
  }

  return hits;
}

function mapBlockHitRow(row, keyword) {
  return {
    blockId: Number(row.id),
    sortOrder: Number(row.sort_order),
    blockKind: row.block_kind,
    text: row.text,
    tableIndex: row.table_index == null ? null : Number(row.table_index),
    rowIndex: row.row_index == null ? null : Number(row.row_index),
    colIndex: row.col_index == null ? null : Number(row.col_index),
    snippet: snippet(row.text, keyword),
  };
}

function loadDocuments({ subtypeCode, moduleCode } = {}) {
  let sql = `SELECT id, doc_code, doc_title, block_count FROM word_faithful_documents WHERE 1=1`;
  const params = [];
  if (subtypeCode) {
    sql += ' AND subtype_code = ?';
    params.push(String(subtypeCode).trim());
  }
  if (moduleCode) {
    sql += ' AND module_code = ?';
    params.push(String(moduleCode).trim());
  }
  sql += ' ORDER BY doc_code';
  return queryAll(sql, params);
}

export function searchWordFaithfulDocuments(keyword, options = {}) {
  const q = String(keyword ?? '').trim();
  const maxDocuments = options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS;
  const documents = loadDocuments({
    subtypeCode: options.subtypeCode,
    moduleCode: options.moduleCode,
  });

  if (!q) {
    const items = documents.slice(0, maxDocuments).map((row) => ({
      ...mapDocumentRow(row),
      hitCount: Number(row.block_count || 0) || 1,
    }));
    return {
      keyword: q,
      totalDocuments: items.length,
      totalHits: items.reduce((sum, item) => sum + item.hitCount, 0),
      items,
      truncated: items.length >= maxDocuments,
    };
  }

  const like = matchesKeywordSql(q);
  const blockHitRows = queryAll(
    `SELECT document_id, COUNT(*) AS hit_count
     FROM word_faithful_blocks
     WHERE LOWER(text) LIKE ?
     GROUP BY document_id`,
    [like]
  );
  const blockHitMap = new Map(
    blockHitRows.map((row) => [Number(row.document_id), Number(row.hit_count)])
  );

  const items = [];
  let totalHits = 0;

  for (const row of documents) {
    const id = Number(row.id);
    const blockHits = blockHitMap.get(id) || 0;
    const metaHits = buildDocumentMetaHits(row, q).length;
    const hitCount = blockHits + metaHits;
    if (!hitCount) continue;

    totalHits += hitCount;
    items.push({
      ...mapDocumentRow(row),
      hitCount,
    });
    if (items.length >= maxDocuments) break;
  }

  return {
    keyword: q,
    totalDocuments: items.length,
    totalHits,
    items,
    truncated: items.length >= maxDocuments,
  };
}

export function getWordFaithfulSearchHits(documentId, keyword, options = {}) {
  const q = String(keyword ?? '').trim();
  const id = Number(documentId);
  if (!q || !Number.isFinite(id) || id <= 0) {
    return { documentId: id, keyword: q, hitCount: 0, hits: [], hitsTruncated: false };
  }

  const hitsLimit = options.hitsLimit ?? DEFAULT_HITS_PER_DOCUMENT;
  const like = matchesKeywordSql(q);

  const docRow = queryOne(
    `SELECT id, doc_code, doc_title FROM word_faithful_documents WHERE id = ?`,
    [id]
  );
  if (!docRow) {
    return { documentId: id, keyword: q, hitCount: 0, hits: [], hitsTruncated: false };
  }

  const metaHits = buildDocumentMetaHits(docRow, q);
  const blockLimit = Math.max(0, hitsLimit - metaHits.length);

  const countRow = queryOne(
    `SELECT COUNT(*) AS c FROM word_faithful_blocks WHERE document_id = ? AND LOWER(text) LIKE ?`,
    [id, like]
  );
  const blockHitCount = Number(countRow?.c || 0);
  const hitCount = blockHitCount + metaHits.length;

  const rows =
    blockLimit > 0
      ? queryAll(
          `SELECT id, sort_order, block_kind, text, table_index, row_index, col_index
           FROM word_faithful_blocks
           WHERE document_id = ? AND LOWER(text) LIKE ?
           ORDER BY sort_order, id
           LIMIT ?`,
          [id, like, blockLimit]
        )
      : [];

  return {
    documentId: id,
    keyword: q,
    hitCount,
    hits: [...metaHits, ...rows.map((row) => mapBlockHitRow(row, q))],
    hitsTruncated: hitCount > hitsLimit,
  };
}
