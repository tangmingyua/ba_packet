/**
 * 填报说明 Word 导入与查询（结构层 + Profile 切分）
 */
import crypto from 'crypto';
import { queryAll, queryOne, run, saveDb } from '../db/database.js';
import { defaultReportCodeForDocCode, normalizeReportCodeInput } from '../config/document-report-mapping.js';
import { stripRomanIndicatorPrefix } from './docx-fill-instruction-parser.js';
import { readDocumentXmlFromDocx } from './docx-file.js';
import { parseWordImportDocument, countTreeNodes } from './word-import-pipeline.js';
import { resolveSubtypeCode } from '../config/system-subtypes.js';
import { resolveImportSubtypeCode, ensureSubtypeVersionForImport } from './dataset-config.js';

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
    subtypeCode: row.subtype_code || '',
    sourceFileName: row.source_file_name || '',
    fileHash: row.file_hash || '',
    sourceId: row.source_id == null ? null : Number(row.source_id),
    blockStart: row.block_start == null ? null : Number(row.block_start),
    blockEnd: row.block_end == null ? null : Number(row.block_end),
    splitMode: row.split_mode || null,
    importedAt: row.imported_at,
  };
}

function mapNodeRow(row) {
  let tableRows = null;
  if (row.meta_json) {
    try {
      const parsed = JSON.parse(row.meta_json);
      if (Array.isArray(parsed?.tableRows)) tableRows = parsed.tableRows;
    } catch {
      tableRows = null;
    }
  }
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
    tableRows,
  };
}

function nodeMetaJson(node) {
  if (node.tableRows?.length) {
    return JSON.stringify({ tableRows: node.tableRows });
  }
  return null;
}

function insertNodeTree(documentId, node, parentId = null) {
  run(
    `INSERT INTO document_nodes (
       document_id, parent_id, node_kind, level, sort_order, text, path, indicator_no, indicator_key, meta_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      nodeMetaJson(node),
    ]
  );
  const inserted = queryOne('SELECT last_insert_rowid() AS id');
  const nodeId = Number(inserted.id);

  for (const child of node.children || []) {
    insertNodeTree(documentId, child, nodeId);
  }
}

function getMappedReportCode(documentId, versionLabel = EMPTY_VERSION) {
  const vl = versionLabel ?? EMPTY_VERSION;
  const row = queryOne(
    `SELECT report_code FROM report_doc_mapping
     WHERE document_id = ? AND version_label = ?`,
    [Number(documentId), vl]
  );
  return row?.report_code ? String(row.report_code) : null;
}

function mapDocumentWithReport(row) {
  const mapped = getMappedReportCode(row.id, row.version_label || EMPTY_VERSION);
  const suggested = defaultReportCodeForDocCode(row.doc_code);
  return {
    ...mapDocumentRow(row),
    reportCode: mapped,
    suggestedReportCode: suggested,
  };
}

function upsertReportMapping(documentId, docCode, { onImport = false, versionLabel = EMPTY_VERSION } = {}) {
  const vl = versionLabel ?? EMPTY_VERSION;
  const existing = getMappedReportCode(documentId, vl);
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
      [auto, vl, documentId, docCode]
    );
  }
}

function findDocument(docCode, versionLabel = EMPTY_VERSION) {
  return queryOne(
    `SELECT * FROM documents WHERE doc_code = ? AND version_label = ?`,
    [docCode, versionLabel]
  );
}

function saveWordSource(fileName, fileHash, profileId, splitMode, blockCount) {
  run(
    `INSERT INTO word_sources (source_file_name, file_hash, profile_id, split_mode, block_count)
     VALUES (?, ?, ?, ?, ?)`,
    [fileName, fileHash, profileId, splitMode, blockCount]
  );
  return Number(queryOne('SELECT last_insert_rowid() AS id').id);
}

function saveWordBlocks(sourceId, blocks) {
  /** @type {Map<number, number>} */
  const idBySort = new Map();
  /** @type {Array<{ sortOrder: number, level: number }>} */
  const headingStack = [];

  for (const block of blocks) {
    if (block.blockKind === 'heading') {
      while (headingStack.length && headingStack[headingStack.length - 1].level >= block.level) {
        headingStack.pop();
      }
    }

    const parentId = headingStack.length
      ? idBySort.get(headingStack[headingStack.length - 1].sortOrder)
      : null;

    run(
      `INSERT INTO word_blocks (source_id, parent_id, block_kind, level, sort_order, text, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        sourceId,
        parentId ?? null,
        block.blockKind,
        block.level ?? 0,
        block.sortOrder,
        block.text,
        block.meta ? JSON.stringify(block.meta) : null,
      ]
    );
    const rowId = Number(queryOne('SELECT last_insert_rowid() AS id').id);
    idBySort.set(block.sortOrder, rowId);

    if (block.blockKind === 'heading') {
      headingStack.push({ sortOrder: block.sortOrder, level: block.level });
    }
  }
}

function saveDocumentTree(
  parsedDoc,
  fileHash,
  fileName,
  moduleCode,
  sourceMeta,
  existingId = null,
  subtypeCode = '',
  versionLabel = EMPTY_VERSION
) {
  const {
    sourceId = null,
    blockStart = null,
    blockEnd = null,
    splitMode = null,
  } = sourceMeta || {};

  const resolvedModule = moduleCode || '1104';
  const resolvedSubtypeCode =
    subtypeCode || resolveSubtypeCode('document', resolvedModule);

  const resolvedVersion = String(versionLabel ?? EMPTY_VERSION).trim();

  if (existingId) {
    run('DELETE FROM document_nodes WHERE document_id = ?', [existingId]);
    run(
      `UPDATE documents SET
         doc_title = ?, version_label = ?, source_file_name = ?, file_hash = ?, module_code = ?, subtype_code = ?,
         source_id = ?, block_start = ?, block_end = ?, split_mode = ?,
         imported_at = datetime('now')
       WHERE id = ?`,
      [
        parsedDoc.docTitle,
        resolvedVersion,
        fileName,
        fileHash,
        resolvedModule,
        resolvedSubtypeCode,
        sourceId,
        blockStart,
        blockEnd,
        splitMode,
        existingId,
      ]
    );
    insertNodeTree(existingId, parsedDoc.tree);
    upsertReportMapping(existingId, parsedDoc.docCode, { onImport: true, versionLabel: resolvedVersion });
    return { id: Number(existingId), overwritten: true, importAction: 'replaced' };
  }

  run(
    `INSERT INTO documents (
       doc_code, doc_title, version_label, subtype_code, module_code, source_file_name, file_hash,
       source_id, block_start, block_end, split_mode
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parsedDoc.docCode,
      parsedDoc.docTitle,
      resolvedVersion,
      resolvedSubtypeCode,
      resolvedModule,
      fileName,
      fileHash,
      sourceId,
      blockStart,
      blockEnd,
      splitMode,
    ]
  );
  const inserted = queryOne('SELECT last_insert_rowid() AS id');
  const documentId = Number(inserted.id);
  insertNodeTree(documentId, parsedDoc.tree);
  upsertReportMapping(documentId, parsedDoc.docCode, { onImport: true, versionLabel: resolvedVersion });
  return { id: documentId, overwritten: false, importAction: 'created' };
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

/**
 * 导入填报说明 docx（结构层 + Profile 切分；合并类自动切多条，失败则整本 1 条）
 */
export function importFillInstructionDocument(buffer, options = {}) {
  const fileName = options.fileName || 'upload.docx';
  const fileHash = hashBuffer(buffer);
  const documentXml = readDocumentXmlFromDocx(buffer);
  const parsed = parseWordImportDocument(documentXml, {
    fileName,
    profileId: options.profileId,
  });

  const moduleCode = String(
    options.moduleCode || parsed.profile?.moduleCode || '1104'
  ).trim();
  const subtypeCode = options.subtypeCode
    ? resolveImportSubtypeCode(options.subtypeCode, 'document', { moduleCode })
    : resolveSubtypeCode('document', moduleCode);

  const importVersion = String(options.versionLabel ?? '').trim();
  if (importVersion) {
    ensureSubtypeVersionForImport(subtypeCode, importVersion);
  }

  const sourceId = saveWordSource(
    fileName,
    fileHash,
    parsed.profile.id,
    parsed.splitMode,
    parsed.blocks.length
  );
  saveWordBlocks(sourceId, parsed.blocks);

  const items = [];
  let imported = 0;
  let overwritten = 0;
  let createdCount = 0;
  let replacedCount = 0;

  for (const doc of parsed.documents) {
    const docVersion = importVersion || EMPTY_VERSION;
    const existing = findDocument(doc.docCode, docVersion);
    const result = saveDocumentTree(
      doc,
      fileHash,
      fileName,
      moduleCode,
      {
        sourceId,
        blockStart: doc.blockStart,
        blockEnd: doc.blockEnd,
        splitMode: doc.splitMode || parsed.splitMode,
      },
      existing?.id,
      subtypeCode,
      docVersion
    );

    if (result.overwritten) {
      overwritten += 1;
      replacedCount += 1;
    } else {
      imported += 1;
      createdCount += 1;
    }

    const actionLabel = result.importAction === 'replaced' ? '覆盖' : '新增';
    items.push({
      ok: true,
      id: result.id,
      overwritten: result.overwritten,
      importAction: result.importAction,
      docCode: doc.docCode,
      docTitle: doc.docTitle,
      reportCode: getMappedReportCode(result.id, docVersion),
      suggestedReportCode: defaultReportCodeForDocCode(doc.docCode),
      nodeCount: countTreeNodes(doc.tree),
      blockCount: doc.blocks.length,
      message: `${actionLabel}：${doc.docCode}（${doc.docTitle}）`,
    });
  }

  saveDb();

  const fallbackHint = parsed.fallback
    ? '未识别合并切分锚点，已整本导入为 1 条'
    : '';
  const countHint =
    items.length === 1
      ? items[0].message
      : `共处理 ${items.length} 张表说明（新增 ${createdCount}，覆盖 ${replacedCount}）`;
  const message = [countHint, fallbackHint].filter(Boolean).join('；');

  const base = {
    ok: true,
    sourceId,
    profileId: parsed.profile.id,
    profileLabel: parsed.profile.label,
    splitMode: parsed.splitMode,
    fallback: parsed.fallback,
    documentCount: items.length,
    imported,
    overwritten,
    createdCount,
    replacedCount,
    items,
    message,
  };

  if (items.length === 1) return { ...base, ...items[0] };
  return base;
}

export function listDocuments({ moduleCode, subtypeCode } = {}) {
  let sql = `
    SELECT d.id, d.doc_code, d.doc_title, d.version_label, d.module_code, d.subtype_code,
            d.source_file_name, d.file_hash, d.imported_at,
            (SELECT COUNT(*) FROM document_nodes n WHERE n.document_id = d.id) AS node_count
     FROM documents d
  `;
  const params = [];
  const conditions = [];
  const mod = String(moduleCode ?? '').trim();
  const subtype = String(subtypeCode ?? '').trim();
  if (mod) {
    conditions.push('d.module_code = ?');
    params.push(mod);
  }
  if (subtype) {
    conditions.push('d.subtype_code = ?');
    params.push(subtype);
  }
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ' ORDER BY d.doc_code';
  const rows = queryAll(sql, params);
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
  const row = queryOne('SELECT id, doc_code, version_label FROM documents WHERE id = ?', [documentId]);
  if (!row) throw new Error('填报说明不存在');

  const versionLabel = String(row.version_label ?? EMPTY_VERSION).trim();
  const normalized = normalizeReportCodeInput(reportCode);
  run('DELETE FROM report_doc_mapping WHERE document_id = ? AND version_label = ?', [
    documentId,
    versionLabel,
  ]);

  if (normalized) {
    const conflict = queryOne(
      `SELECT document_id FROM report_doc_mapping
       WHERE report_code = ? AND version_label = ? AND document_id != ?`,
      [normalized, versionLabel, documentId]
    );
    if (conflict) {
      throw new Error(`表样 ${normalized} 已关联其他填报说明`);
    }
    run(
      `INSERT INTO report_doc_mapping (report_code, version_label, document_id, doc_code)
       VALUES (?, ?, ?, ?)`,
      [normalized, versionLabel, documentId, row.doc_code]
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

/** 按表样 report_code 查 document 元数据（不含节点树）；仅查 report_doc_mapping */
export function getDocumentByReport(reportCode, { versionLabel } = {}) {
  const normalized = normalizeReportCodeInput(reportCode);
  if (!normalized) return null;

  const preferredVersion = String(versionLabel ?? EMPTY_VERSION).trim();
  const versionsToTry = [];
  if (preferredVersion) versionsToTry.push(preferredVersion);
  if (!versionsToTry.includes(EMPTY_VERSION)) versionsToTry.push(EMPTY_VERSION);

  let mapping = null;
  for (const vl of versionsToTry) {
    mapping = queryOne(
      `SELECT document_id, doc_code FROM report_doc_mapping
       WHERE report_code = ? AND version_label = ?`,
      [normalized, vl]
    );
    if (mapping) break;
  }

  if (!mapping) {
    mapping = queryOne(
      `SELECT document_id, doc_code FROM report_doc_mapping
       WHERE report_code = ?
       ORDER BY document_id DESC
       LIMIT 1`,
      [normalized]
    );
  }
  if (!mapping) return null;

  const row = queryOne('SELECT * FROM documents WHERE id = ?', [Number(mapping.document_id)]);
  if (!row) return null;

  const nodeCount = Number(
    queryOne('SELECT COUNT(*) AS c FROM document_nodes WHERE document_id = ?', [row.id])?.c || 0
  );

  return {
    ...mapDocumentWithReport(row),
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
