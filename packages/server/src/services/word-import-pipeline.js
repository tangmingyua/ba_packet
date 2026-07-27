/**
 * Word 导入流水线：结构提取 → Profile 切分 → 逻辑文档树
 */
import {
  extractDocCodeFromTitle,
  resolveWordImportProfile,
} from '../config/document-import-profiles.js';
import { defaultReportCodeForDocCode } from '../config/document-report-mapping.js';
import {
  parseDocCode,
  parseDocumentParagraphs,
  splitMergedDocuments,
  extractParagraphTexts,
} from './docx-fill-instruction-parser.js';
import {
  blocksToParagraphs,
  extractWordBlocks,
  placeholderText,
  sampleTextFromBlocks,
} from './word-structure-extractor.js';

/**
 * @typedef {object} WordBlock
 * @property {'heading'|'paragraph'|'placeholder'} blockKind
 * @property {number} level
 * @property {number} sortOrder
 * @property {string} text
 * @property {Record<string, unknown>} [meta]
 */

/**
 * @typedef {object} LogicalWordDocument
 * @property {string} docCode
 * @property {string} docTitle
 * @property {number} blockStart
 * @property {number} blockEnd
 * @property {WordBlock[]} blocks
 * @property {object} tree
 * @property {string} splitMode
 */

function inferReportCode(docCode, blocks) {
  const mapped = defaultReportCodeForDocCode(docCode);
  if (mapped) return mapped;
  if (/^NR\d{2}$/i.test(docCode)) return docCode.toUpperCase();
  for (const block of blocks || []) {
    const m = String(block.text || '').match(/报表编码[：:]\s*(NR\d{2}|G\d{2,4}|S\d{2,4})/i);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function applyPlaceholderReportCodes(blocks, docCode) {
  const reportCode = inferReportCode(docCode, blocks);
  for (const block of blocks) {
    if (block.blockKind !== 'placeholder') continue;
    block.text = placeholderText(reportCode);
    block.meta = { ...(block.meta || {}), reportCode: reportCode || null };
  }
  return reportCode;
}

function extractDocCodeFromFileName(fileName) {
  const base = String(fileName || '').replace(/\.docx$/i, '');
  const nr = base.match(/\b(NR\d{2})\b/i);
  if (nr) return nr[1].toUpperCase();
  const g = base.match(/\b(G\d{2,4})\b/i);
  if (g) return g[1].toUpperCase();
  return '';
}

function anchorMatches(block, profile) {
  if (block.meta?.skipInOutline) return false;
  if (!profile.anchorTextMatch) return false;
  const text = String(block.text || '').trim();
  if (!profile.anchorTextMatch.test(text)) return false;
  if (
    profile.levelMax != null &&
    block.blockKind === 'heading' &&
    block.level > profile.levelMax
  ) {
    return false;
  }
  return true;
}

/** @returns {Array<{ index: number, docCode: string, docTitle: string }>} */
function findSplitAnchors(blocks, profile) {
  /** @type {Array<{ index: number, docCode: string, docTitle: string }>} */
  const anchors = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!anchorMatches(block, profile)) continue;
    const docTitle = block.text.trim();
    const docCode =
      extractDocCodeFromTitle(docTitle, profile) ||
      parseDocCode(docTitle) ||
      extractDocCodeFromTitle(docTitle, { docCodeFromTitle: /(NR\d{2})/i }) ||
      '';
    if (!docCode) continue;
    anchors.push({ index: i, docCode, docTitle });
  }
  return anchors;
}

function assignLevelsAndPaths(node, parentPath = '', level = 0, counters = {}) {
  node.level = level;
  const key = `${level}:${node.nodeKind}`;
  counters[key] = (counters[key] || 0) + 1;
  node.sortOrder = counters[key];

  const segment =
    node.nodeKind === 'doc_title'
      ? node.docCode || node.text
      : node.nodeKind === 'indicator'
        ? node.text
        : node.text.length > 24
          ? `${node.text.slice(0, 24)}…`
          : node.text;

  node.path = parentPath ? `${parentPath}/${segment}` : segment;
  for (const child of node.children || []) {
    assignLevelsAndPaths(child, node.path, level + 1, counters);
  }
}

export function buildStructureDocumentTree(blocks, meta = {}) {
  const root = {
    nodeKind: 'doc_title',
    text: meta.docTitle || blocks[0]?.text || '',
    docCode: meta.docCode || '',
    children: [],
  };

  /** @type {Array<{ node: object, level: number }>} */
  const stack = [{ node: root, level: 0 }];

  for (const block of blocks) {
    if (block.blockKind === 'heading') {
      const node = {
        nodeKind: 'heading',
        text: block.text,
        children: [],
      };
      while (stack.length > 1 && stack[stack.length - 1].level >= block.level) {
        stack.pop();
      }
      stack[stack.length - 1].node.children.push(node);
      stack.push({ node, level: block.level });
      continue;
    }

    const nodeKind = block.blockKind === 'placeholder' ? 'placeholder' : 'paragraph';
    stack[stack.length - 1].node.children.push({
      nodeKind,
      text: block.text,
      children: [],
    });
  }

  assignLevelsAndPaths(root);
  return root;
}

function buildDocumentTree(blocks, profile, meta) {
  if (profile.treeMode === '1104-semantic') {
    const paragraphs = blocksToParagraphs(blocks);
    if (!paragraphs.length) {
      return buildStructureDocumentTree(blocks, meta);
    }
    return parseDocumentParagraphs(paragraphs, {
      docCode: meta.docCode,
      docTitle: meta.docTitle,
    });
  }
  return buildStructureDocumentTree(blocks, meta);
}

function buildFallbackDocument(blocks, fileName) {
  const docCode =
    extractDocCodeFromFileName(fileName) ||
    parseDocCode(blocks.find((b) => !b.meta?.skipInOutline)?.text || '') ||
    'DOC';
  const docTitle =
    String(fileName || '')
      .replace(/\.docx$/i, '')
      .trim() ||
    blocks.find((b) => b.blockKind === 'heading' && !b.meta?.skipInOutline)?.text ||
    docCode;

  return {
    docCode,
    docTitle,
    blockStart: 0,
    blockEnd: blocks.length,
    blocks: [...blocks],
    splitMode: 'fallback_whole',
  };
}

function paragraphsToBlocks(paragraphs) {
  return paragraphs.map((text, sortOrder) => ({
    blockKind: 'paragraph',
    level: 0,
    sortOrder,
    text,
    meta: { source: 'word_p_flat' },
  }));
}

function buildFrom1104Paragraphs(paragraphs, profile, options) {
  const splitDocs = splitMergedDocuments(paragraphs);
  const useMulti = splitDocs.length >= (profile.minAnchors ?? 2);
  const blocks = paragraphsToBlocks(paragraphs);

  /** @type {LogicalWordDocument[]} */
  let documents;
  let splitMode;
  let fallback;

  if (useMulti) {
    splitMode = 'multi';
    fallback = false;
    let searchFrom = 0;
    documents = splitDocs.map((doc) => {
      const start = paragraphs.findIndex((p, i) => i >= searchFrom && p === doc.paragraphs[0]);
      const end = start >= 0 ? start + doc.paragraphs.length : searchFrom + doc.paragraphs.length;
      if (start >= 0) searchFrom = end;
      const segment = start >= 0 ? blocks.slice(start, end) : paragraphsToBlocks(doc.paragraphs);
      applyPlaceholderReportCodes(segment, doc.docCode);
      return {
        docCode: doc.docCode,
        docTitle: doc.docTitle,
        blockStart: start >= 0 ? start : 0,
        blockEnd: start >= 0 ? end : doc.paragraphs.length,
        blocks: segment,
        splitMode: 'multi',
        tree: parseDocumentParagraphs(doc.paragraphs, {
          docCode: doc.docCode,
          docTitle: doc.docTitle,
        }),
      };
    });
  } else {
    splitMode = 'fallback_whole';
    fallback = true;
    const fallbackDoc = buildFallbackDocument(blocks, options.fileName);
    applyPlaceholderReportCodes(fallbackDoc.blocks, fallbackDoc.docCode);
    fallbackDoc.tree = buildDocumentTree(fallbackDoc.blocks, profile, {
      docCode: fallbackDoc.docCode,
      docTitle: fallbackDoc.docTitle,
    });
    documents = [fallbackDoc];
  }

  return { profile, splitMode, fallback, blocks, documents };
}

/**
 * @param {string} documentXml
 * @param {{ fileName?: string, profileId?: string }} options
 */
export function parseWordImportDocument(documentXml, options = {}) {
  const paragraphs = extractParagraphTexts(documentXml);
  const paragraphSample = paragraphs.slice(0, 150).join('\n');
  let profile = resolveWordImportProfile(options.profileId, {
    fileName: options.fileName,
    sampleText: paragraphSample,
  });

  if (profile.treeMode === '1104-semantic') {
    return buildFrom1104Paragraphs(paragraphs, profile, options);
  }

  const blocks = extractWordBlocks(documentXml);
  const blockSample = sampleTextFromBlocks(blocks);
  profile = resolveWordImportProfile(options.profileId, {
    fileName: options.fileName,
    sampleText: blockSample || paragraphSample,
  });

  const anchors = profile.anchorTextMatch ? findSplitAnchors(blocks, profile) : [];
  const useMulti = anchors.length >= (profile.minAnchors ?? 2);

  /** @type {LogicalWordDocument[]} */
  let logicalDocs;
  let splitMode;

  if (useMulti) {
    splitMode = 'multi';
    logicalDocs = anchors.map((anchor, idx) => {
      const start = anchor.index;
      const end = idx + 1 < anchors.length ? anchors[idx + 1].index : blocks.length;
      const segment = blocks.slice(start, end);
      applyPlaceholderReportCodes(segment, anchor.docCode);
      return {
        docCode: anchor.docCode,
        docTitle: anchor.docTitle,
        blockStart: start,
        blockEnd: end,
        blocks: segment,
        splitMode: 'multi',
        tree: null,
      };
    });
  } else {
    splitMode = 'fallback_whole';
    const fallback = buildFallbackDocument(blocks, options.fileName);
    applyPlaceholderReportCodes(fallback.blocks, fallback.docCode);
    logicalDocs = [fallback];
  }

  for (const doc of logicalDocs) {
    doc.tree = buildDocumentTree(doc.blocks, profile, {
      docCode: doc.docCode,
      docTitle: doc.docTitle,
    });
  }

  return {
    profile,
    splitMode,
    fallback: !useMulti,
    blocks,
    documents: logicalDocs,
  };
}

export function countTreeNodes(node) {
  return 1 + (node.children || []).reduce((sum, c) => sum + countTreeNodes(c), 0);
}
