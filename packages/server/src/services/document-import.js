/**
 * 1104 合并填报说明 Word 导入与查询
 */
import crypto from 'crypto';
import { queryAll, queryOne, run, saveDb } from '../db/database.js';
import { defaultReportCodeForDocCode, normalizeReportCodeInput } from '../config/document-report-mapping.js';
import {
  parseFillInstructionDocumentXml,
  stripRomanIndicatorPrefix,
} from './docx-fill-instruction-parser.js';
import { readDocumentXmlFromDocx } from './docx-file.js';

const EMPTY_VERSION = '';

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function mapDocumentRow(row) {
  return {
    id: Number(row.id),
    docCode: row.doc_code,
    docTitle: row.doc_title || '',
    versionLabel: row.version_label || '',
    moduleCode: row.module_code || '1104',
    sourceFileName: row.source_file_name || '',
    fileHash: row.file_hash || '',
    importedAt: row.imported_at,
  };
}

function mapNodeRow(row) {
  return {
    id: Number(row.id),
    documentId: Number(row.document_id),
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    nodeKind: row.node_kind,
    level: Number(row.level),
    sortOrder: Number(row.sort_order),
    text: row.text,
    path: row.path || '',
    indicatorNo: row.indicator_no == null ? null : Number(row.indicator_no),
    indicatorKey: row.indicator_key || null,
  };
}

function insertNodeTree(documentId, node, parentId = null) {
  run(
    `INSERT INTO document_nodes (
       document_id, parent_id, node_kind, level, sort_order, text, path, indicator_no, indicator_key
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      documentId,
      parentId,
      node.nodeKind,
      node.level ?? 0,
      node.sortOrder ?? 0,
      node.text,
      node.path || '',
      node.indicatorNo ?? null,
      node.indicatorKey ?? null,
    ]
  );
  const inserted = queryOne('SELECT last_insert_rowid() AS id');
  const nodeId = Number(inserted.id);

  for (const child of node.children || []) {
    insertNodeTree(documentId, child, nodeId);
  }
}

function getMappedReportCode(documentId) {
  const row = queryOne(
    `SELECT report_code FROM report_doc_mapping
     WHERE document_id = ? AND version_label = ?`,
    [Number(documentId), EMPTY_VERSION]
  );
  return row?.report_code ? String(row.report_code) : null;
}

function mapDocumentWithReport(row) {
  const mapped = getMappedReportCode(row.id);
  const suggested = defaultReportCodeForDocCode(row.doc_code);
  return {
    ...mapDocumentRow(row),
    reportCode: mapped,
    suggestedReportCode: suggested,
  };
}

function upsertReportMapping(documentId, docCode, { onImport = false } = {}) {
  const existing = getMappedReportCode(documentId);
  if (onImport && existing) return;

  const auto = defaultReportCodeForDocCode(docCode);
  if (onImport) {
    if (!auto) return;
    if (existing) return;
  }

  run('DELETE FROM report_doc_mapping WHERE document_id = ?', [documentId]);
  if (auto) {
    run(
      `INSERT INTO report_doc_mapping (report_code, version_label, document_id, doc_code)
       VALUES (?, ?, ?, ?)`,
      [auto, EMPTY_VERSION, documentId, docCode]
    );
  }
}

function findDocument(docCode, versionLabel = EMPTY_VERSION) {
  return queryOne(
    `SELECT * FROM documents WHERE doc_code = ? AND version_label = ?`,
    [docCode, versionLabel]
  );
}

function saveDocumentTree(parsedDoc, fileHash, fileName, existingId = null) {
  if (existingId) {
    run('DELETE FROM document_nodes WHERE document_id = ?', [existingId]);
    run(
      `UPDATE documents SET
         doc_title = ?, source_file_name = ?, file_hash = ?, imported_at = datetime('now')
       WHERE id = ?`,
      [parsedDoc.docTitle, fileName, fileHash, existingId]
    );
    insertNodeTree(existingId, parsedDoc.tree);
    upsertReportMapping(existingId, parsedDoc.docCode, { onImport: true });
    return { id: Number(existingId), overwritten: true };
  }

  run(
    `INSERT INTO documents (
       doc_code, doc_title, version_label, module_code, source_file_name, file_hash
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [parsedDoc.docCode, parsedDoc.docTitle, EMPTY_VERSION, '1104', fileName, fileHash]
  );
  const inserted = queryOne('SELECT last_insert_rowid() AS id');
  const documentId = Number(inserted.id);
  insertNodeTree(documentId, parsedDoc.tree);
  upsertReportMapping(documentId, parsedDoc.docCode, { onImport: true });
  return { id: documentId, overwritten: false };
}

function buildTreeFromRows(rows) {
  const byId = new Map();
  let root = null;

  for (const row of rows) {
    const node = { ...mapNodeRow(row), children: [] };
    byId.set(node.id, node);
  }

  for (const node of byId.values()) {
    if (node.parentId == null) {
      root = node;
      continue;
    }
    const parent = byId.get(node.parentId);
    if (parent) parent.children.push(node);
  }

  if (root) {
    const sortRec = (n) => {
      n.children.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      n.children.forEach(sortRec);
    };
    sortRec(root);
  }

  return root;
}

function countTreeNodes(node) {
  return 1 + (node.children || []).reduce((sum, c) => sum + countTreeNodes(c), 0);
}

/**
 * 导入合并填报说明 docx（按 G 表拆分为多条 document）
 */
export function importFillInstructionDocument(buffer, options = {}) {
  const fileName = options.fileName || 'upload.docx';
  const fileHash = hashBuffer(buffer);
  const documentXml = readDocumentXmlFromDocx(buffer);
  const { documents: parsedDocs } = parseFillInstructionDocumentXml(documentXml);

  const items = [];
  let imported = 0;
  let overwritten = 0;

  for (const doc of parsedDocs) {
    const existing = findDocument(doc.docCode, EMPTY_VERSION);
    const result = saveDocumentTree(doc, fileHash, fileName, existing?.id);
    if (result.overwritten) overwritten += 1;
    else imported += 1;

    items.push({
      ok: true,
      id: result.id,
      overwritten: result.overwritten,
      docCode: doc.docCode,
      docTitle: doc.docTitle,
      reportCode: getMappedReportCode(result.id),
      suggestedReportCode: defaultReportCodeForDocCode(doc.docCode),
      nodeCount: countTreeNodes(doc.tree),
      message: result.overwritten
        ? `已覆盖填报说明 ${doc.docCode}（${doc.docTitle}）`
        : `导入成功：${doc.docCode}（${doc.docTitle}）`,
    });
  }

  saveDb();

  const message =
    items.length === 1
      ? items[0].message
      : `共处理 ${items.length} 张表说明（新增 ${imported}，覆盖 ${overwritten}）`;

  const base = {
    ok: true,
    documentCount: items.length,
    imported,
    overwritten,
    items,
    message,
  };

  if (items.length === 1) return { ...base, ...items[0] };
  return base;
}

export function listDocuments() {
  const rows = queryAll(
    `SELECT d.id, d.doc_code, d.doc_title, d.version_label, d.module_code,
            d.source_file_name, d.file_hash, d.imported_at,
            (SELECT COUNT(*) FROM document_nodes n WHERE n.document_id = d.id) AS node_count
     FROM documents d
     ORDER BY d.doc_code`
  );
  return rows.map((row) => ({
    ...mapDocumentWithReport(row),
    nodeCount: Number(row.node_count || 0),
  }));
}

export function getDocument(id) {
  const row = queryOne('SELECT * FROM documents WHERE id = ?', [Number(id)]);
  if (!row) return null;

  const nodeRows = queryAll(
    `SELECT * FROM document_nodes WHERE document_id = ? ORDER BY level, sort_order, id`,
    [Number(id)]
  );

  return {
    ...mapDocumentWithReport(row),
    tree: buildTreeFromRows(nodeRows),
    nodeCount: nodeRows.length,
  };
}

/**
 * 按指标序号取指标节点及其正文子节点（不含整棵树）
 * 匹配：先 indicator_key 全等，再去掉罗马前缀（Ⅲ_4 ↔ 4）
 */
export function getDocumentIndicator(id, indicatorKey) {
  const documentId = Number(id);
  const key = String(indicatorKey || '').trim();
  if (!key) return null;

  const doc = queryOne('SELECT * FROM documents WHERE id = ?', [documentId]);
  if (!doc) return null;

  let row = queryOne(
    `SELECT * FROM document_nodes
     WHERE document_id = ? AND node_kind = 'indicator' AND indicator_key = ?
     ORDER BY id
     LIMIT 1`,
    [documentId, key]
  );

  if (!row) {
    const shortKey = stripRomanIndicatorPrefix(key);
    const candidates = queryAll(
      `SELECT * FROM document_nodes
       WHERE document_id = ? AND node_kind = 'indicator'
       ORDER BY id`,
      [documentId]
    );
    row =
      candidates.find((c) => stripRomanIndicatorPrefix(c.indicator_key || '') === shortKey) ||
      null;
  }

  if (!row) {
    return {
      found: false,
      document: mapDocumentWithReport(doc),
      indicatorKey: key,
      indicator: null,
    };
  }

  const bodyRows = queryAll(
    `SELECT * FROM document_nodes
     WHERE document_id = ? AND parent_id = ? AND node_kind = 'body'
     ORDER BY sort_order, id`,
    [documentId, row.id]
  );

  const indicator = {
    ...mapNodeRow(row),
    children: bodyRows.map((b) => ({ ...mapNodeRow(b), children: [] })),
  };

  return {
    found: true,
    document: mapDocumentWithReport(doc),
    indicatorKey: row.indicator_key || key,
    queryKey: key,
    indicator,
  };
}

/** 人工设置 / 清除对应表样 report_code（空字符串表示清除） */
export function updateDocumentReportMapping(id, reportCode) {
  const documentId = Number(id);
  const row = queryOne('SELECT id, doc_code FROM documents WHERE id = ?', [documentId]);
  if (!row) throw new Error('填报说明不存在');

  const normalized = normalizeReportCodeInput(reportCode);
  run('DELETE FROM report_doc_mapping WHERE document_id = ?', [documentId]);

  if (normalized) {
    const conflict = queryOne(
      `SELECT document_id FROM report_doc_mapping
       WHERE report_code = ? AND version_label = ? AND document_id != ?`,
      [normalized, EMPTY_VERSION, documentId]
    );
    if (conflict) {
      throw new Error(`表样 ${normalized} 已关联其他填报说明`);
    }
    run(
      `INSERT INTO report_doc_mapping (report_code, version_label, document_id, doc_code)
       VALUES (?, ?, ?, ?)`,
      [normalized, EMPTY_VERSION, documentId, row.doc_code]
    );
  }

  saveDb();
  return {
    ok: true,
    id: documentId,
    docCode: row.doc_code,
    reportCode: normalized || null,
    message: normalized ? `已关联表样 ${normalized}` : '已清除表样关联',
  };
}

/** 按表样 report_code 查 document 元数据（不含节点树） */
export function getDocumentByReport(reportCode) {
  const normalized = normalizeReportCodeInput(reportCode);
  if (!normalized) return null;
  const mapping = queryOne(
    `SELECT document_id, doc_code FROM report_doc_mapping
     WHERE report_code = ? AND version_label = ?`,
    [normalized, EMPTY_VERSION]
  );
  if (!mapping) return null;

  const row = queryOne('SELECT * FROM documents WHERE id = ?', [Number(mapping.document_id)]);
  if (!row) return null;

  const nodeCount = Number(
    queryOne('SELECT COUNT(*) AS c FROM document_nodes WHERE document_id = ?', [row.id])?.c || 0
  );

  return {
    ...mapDocumentRow(row),
    reportCode: normalized,
    nodeCount,
  };
}

export function deleteDocument(id) {
  const documentId = Number(id);
  const existing = queryOne('SELECT id, doc_code FROM documents WHERE id = ?', [documentId]);
  if (!existing) throw new Error('填报说明不存在');

  run('DELETE FROM report_doc_mapping WHERE document_id = ?', [documentId]);
  run('DELETE FROM document_nodes WHERE document_id = ?', [documentId]);
  run('DELETE FROM documents WHERE id = ?', [documentId]);
  saveDb();

  return {
    ok: true,
    id: documentId,
    docCode: existing.doc_code,
    message: `已删除填报说明 ${existing.doc_code}`,
  };
}
