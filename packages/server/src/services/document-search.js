/**
 * 1104 填报说明搜索（两阶段：按 document 聚合 + 单文档命中明细）
 */
import { queryAll, queryOne } from '../db/database.js';
import { NODE_KIND_LABELS, SEARCHABLE_NODE_KINDS } from '../config/document-search-scope.js';

const DEFAULT_HITS_PER_DOCUMENT = 30;
const DEFAULT_MAX_DOCUMENTS = 50;

const KIND_PLACEHOLDERS = SEARCHABLE_NODE_KINDS.map(() => '?').join(', ');

function cellText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function matchesKeywordSql(keyword) {
  return `%${String(keyword).toLowerCase()}%`;
}

function matchesKeyword(text, keyword) {
  if (!text) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function snippet(text, keyword, maxLen = 100) {
  const s = cellText(text);
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

function kindLabel(kind) {
  return NODE_KIND_LABELS[kind] || kind || '';
}

function mapDocumentRow(row) {
  return {
    id: Number(row.id),
    docCode: row.doc_code,
    docTitle: row.doc_title || '',
    reportCode: row.report_code || null,
    nodeCount: Number(row.node_count || 0),
  };
}

function buildDocumentMetaHits(documentRow, keyword) {
  if (!documentRow) return [];
  const hits = [];
  const code = documentRow.doc_code || '';
  const title = documentRow.doc_title || '';

  if (matchesKeyword(code, keyword)) {
    hits.push({
      nodeId: null,
      nodeKind: 'document_code',
      path: '',
      indicatorKey: null,
      indicatorNo: null,
      text: code,
      snippet: snippet(code, keyword),
    });
  }

  if (title && matchesKeyword(title, keyword) && title.toLowerCase() !== code.toLowerCase()) {
    hits.push({
      nodeId: null,
      nodeKind: 'document_title',
      path: '',
      indicatorKey: null,
      indicatorNo: null,
      text: title,
      snippet: snippet(title, keyword),
    });
  }

  return hits;
}

function countDocumentMetaHits(documentRow, keyword) {
  return buildDocumentMetaHits(documentRow, keyword).length;
}

function mapNodeHitRow(row, keyword) {
  return {
    nodeId: Number(row.id),
    nodeKind: row.node_kind,
    path: row.path || '',
    indicatorKey: row.indicator_key || null,
    indicatorNo: row.indicator_no == null ? null : Number(row.indicator_no),
    text: row.text,
    snippet: snippet(row.text, keyword),
  };
}

function loadDocumentsWithMeta() {
  const rows = queryAll(
    `SELECT d.id, d.doc_code, d.doc_title,
            (SELECT COUNT(*) FROM document_nodes n WHERE n.document_id = d.id) AS node_count,
            (SELECT report_code FROM report_doc_mapping m
             WHERE m.document_id = d.id AND m.version_label = '' LIMIT 1) AS report_code
     FROM documents d
     ORDER BY d.doc_code`
  );
  return rows;
}

/**
 * 阶段 1：按填报说明聚合命中数
 */
export function searchDocuments(keyword, options = {}) {
  const q = String(keyword ?? '').trim();
  if (!q) {
    return {
      keyword: q,
      totalDocuments: 0,
      totalHits: 0,
      items: [],
      searchScope: 'document_meta_and_node_text',
    };
  }

  const maxDocuments = options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS;
  const like = matchesKeywordSql(q);
  const documents = loadDocumentsWithMeta();

  const nodeHitRows = queryAll(
    `SELECT document_id, COUNT(*) AS hit_count
     FROM document_nodes
     WHERE node_kind IN (${KIND_PLACEHOLDERS}) AND LOWER(text) LIKE ?
     GROUP BY document_id`,
    [...SEARCHABLE_NODE_KINDS, like]
  );
  const nodeHitMap = new Map(
    nodeHitRows.map((row) => [Number(row.document_id), Number(row.hit_count)])
  );

  const items = [];
  let totalHits = 0;

  for (const row of documents) {
    const id = Number(row.id);
    const nodeHits = nodeHitMap.get(id) || 0;
    const metaHits = countDocumentMetaHits(row, q);
    const hitCount = nodeHits + metaHits;
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
    searchScope: 'document_meta_and_node_text',
  };
}

/**
 * 阶段 2：单份说明命中明细
 */
export function getDocumentSearchHits(documentId, keyword, options = {}) {
  const q = String(keyword ?? '').trim();
  const id = Number(documentId);
  if (!q || !Number.isFinite(id) || id <= 0) {
    return { documentId: id, keyword: q, hitCount: 0, hits: [], hitsTruncated: false };
  }

  const hitsLimit = options.hitsLimit ?? DEFAULT_HITS_PER_DOCUMENT;
  const like = matchesKeywordSql(q);

  const docRow = queryOne(
    `SELECT d.id, d.doc_code, d.doc_title,
            (SELECT report_code FROM report_doc_mapping m
             WHERE m.document_id = d.id AND m.version_label = '' LIMIT 1) AS report_code
     FROM documents d
     WHERE d.id = ?`,
    [id]
  );
  if (!docRow) {
    return { documentId: id, keyword: q, hitCount: 0, hits: [], hitsTruncated: false };
  }

  const metaHits = buildDocumentMetaHits(docRow, q);
  const nodeLimit = Math.max(0, hitsLimit - metaHits.length);

  const countRow = queryOne(
    `SELECT COUNT(*) AS c
     FROM document_nodes
     WHERE document_id = ? AND node_kind IN (${KIND_PLACEHOLDERS}) AND LOWER(text) LIKE ?`,
    [id, ...SEARCHABLE_NODE_KINDS, like]
  );
  const nodeHitCount = Number(countRow?.c || 0);
  const hitCount = nodeHitCount + metaHits.length;

  const rows =
    nodeLimit > 0
      ? queryAll(
          `SELECT id, node_kind, path, text, indicator_no, indicator_key
           FROM document_nodes
           WHERE document_id = ? AND node_kind IN (${KIND_PLACEHOLDERS}) AND LOWER(text) LIKE ?
           ORDER BY level, sort_order, id
           LIMIT ?`,
          [id, ...SEARCHABLE_NODE_KINDS, like, nodeLimit]
        )
      : [];

  const hits = [...metaHits, ...rows.map((row) => mapNodeHitRow(row, q))];

  return {
    documentId: id,
    keyword: q,
    hitCount,
    hits,
    hitsTruncated: hitCount > hitsLimit,
  };
}

export { kindLabel };
