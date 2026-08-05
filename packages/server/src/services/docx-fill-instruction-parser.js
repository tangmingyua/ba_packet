/**
 * 1104 合并填报说明 Word 解析（纯文本规则）
 *
 * - 仅「具体说明」类 part 保留子树（section / indicator / body）
 * - 其余 part 为叶子：后续段落并入 part.text
 * - 指标支持罗马前缀（Ⅲ_4）及多序号拆分
 */
import { summarizeTableRows } from './word-structure-extractor.js';

/** 罗马数字（保留原文，如 GF01_Ⅱ、Ⅲ_4） */
const ROMAN_CHARS = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅺⅻ';
const ROMAN_CLASS = `[${ROMAN_CHARS}]`;
/**
 * 说明代号：字母开头即可（G01 / S24 / SF21 / G01_II / S30_I-1 等）
 * 标题变体：代号与《之间可有空格、或（别名）如 S21（SF21）《…》
 */
const DOC_CODE_TOKEN = `[A-Za-z][A-Za-z0-9_${ROMAN_CHARS}-]*`;
const DOC_TITLE_RE = new RegExp(
  `^${DOC_CODE_TOKEN}(?:\\s*[（(][^）)]+[）)])?\\s*《.+》填报说明(?:（.+）)?$`
);
const DOC_CODE_RE = new RegExp(`^(${DOC_CODE_TOKEN})`);
const PART_RE = /^第[一二三四五六七八九十百零]+部分：/;
/** 指标序号：4、4.1、25a、Ⅲ_4、Ⅱ_1.1，以及列字母 A/B/D/AA 等 */
const INDICATOR_KEY_CORE = `(?:\\d+(?:\\.\\d+)*[a-zA-Z]?|[A-Za-z]{1,3})`;
const INDICATOR_KEY_RE = new RegExp(`(?:${ROMAN_CLASS}_)?${INDICATOR_KEY_CORE}`);
const INDICATOR_KEY_CAPTURE = new RegExp(`^((?:${ROMAN_CLASS}_)?${INDICATOR_KEY_CORE})`);

/** 核对关系下的假大纲，并入当前叶子 part，不新开 part */
const CHECK_SUBPART_RE =
  /^第[一二三四五六七八九十百零]+部分：\s*(基础数据|汇总计算|附注项目)\s*$/;

/**
 * 仅用于分类/匹配的轻量归一；展示仍用原文
 */
export function normalizeForMatch(text) {
  return String(text || '')
    .replace(/［/g, '[')
    .replace(/］/g, ']')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 去掉指标 key 的罗马前缀：Ⅲ_4 → 4 */
export function stripRomanIndicatorPrefix(key) {
  return String(key || '').replace(new RegExp(`^${ROMAN_CLASS}_`), '');
}

/** 是否为「具体说明」类（唯一允许子树的 part） */
export function isDetailPartTitle(text) {
  return /具体说明|指标释义|主要项目说明/.test(String(text || ''));
}

function isCheckRelationPart(text) {
  return /核对关系|校验关系|校对关系/.test(String(text || ''));
}

/** 是否作为文档大纲 part（短标题；长叙述不当 part） */
export function isOutlinePartTitle(text) {
  const t = String(text || '').trim();
  if (!PART_RE.test(t)) return false;
  if (t.length > 40) return false;
  if (t.includes('。')) return false;
  return true;
}

function extractOriginalBracketTitle(original) {
  const asciiClose = original.indexOf(']');
  const fullClose = original.indexOf('］');
  let closeIdx = -1;
  if (asciiClose >= 0 && fullClose >= 0) closeIdx = Math.min(asciiClose, fullClose);
  else closeIdx = Math.max(asciiClose, fullClose);
  if (closeIdx >= 0) return original.slice(0, closeIdx + 1).trim();
  return original;
}

function parseInlineBody(tail) {
  if (!tail) return { ok: true, inlineBody: '' };
  const trimmed = tail.replace(/^\s+/, '');
  if (/^[：:]/.test(trimmed)) {
    return { ok: true, inlineBody: trimmed.replace(/^[：:]+/, '').trim() };
  }
  if (/^[=＝≥>≤＜+]/.test(trimmed) || /\[[^\]]*\]/.test(trimmed)) {
    return { ok: false };
  }
  return { ok: true, inlineBody: trimmed.trim() };
}

/**
 * @returns {null | { entries: Array<{indicatorKey, indicatorName, titleText}>, inlineBody: string }}
 */
function parseIndicatorBracket(text) {
  const original = String(text || '').trim();
  const raw = normalizeForMatch(original);
  if (!raw.startsWith('[')) return null;
  const close = raw.indexOf(']');
  if (close < 0) return null;

  const bodyParsed = parseInlineBody(raw.slice(close + 1));
  if (!bodyParsed.ok) return null;
  const inlineBody = bodyParsed.inlineBody;

  const inner = raw.slice(1, close);
  const keyToken = INDICATOR_KEY_RE.source;
  const multi = inner.match(
    new RegExp(`^(${keyToken}(?:[、，,]\\s*${keyToken})+)(.*)$`)
  );

  if (multi) {
    const keys = multi[1].split(/[、，,]\s*/).filter(Boolean);
    const indicatorName = (multi[2] || '').replace(/^[．.\s]+/, '').trim();
    if (keys.length < 2) return null;
    const entries = keys.map((indicatorKey) => ({
      indicatorKey,
      indicatorName,
      titleText: indicatorName ? `[${indicatorKey}${indicatorName}]` : `[${indicatorKey}]`,
    }));
    return { entries, inlineBody };
  }

  const keyMatch = inner.match(INDICATOR_KEY_CAPTURE);
  if (!keyMatch) return null;

  const indicatorKey = keyMatch[1];
  const rest = inner.slice(indicatorKey.length);
  let indicatorName = '';
  if (rest.startsWith('．') || rest.startsWith('.')) {
    indicatorName = rest.slice(1);
  } else {
    indicatorName = rest;
  }
  if (!indicatorName) return null;

  const titleText = extractOriginalBracketTitle(original);
  return {
    entries: [{ indicatorKey, indicatorName, titleText }],
    inlineBody,
  };
}

function matchIndicator(text) {
  return parseIndicatorBracket(text);
}

export function extractParagraphTexts(documentXml) {
  const pRe = /<w:p[\s\S]*?<\/w:p>/g;
  const blocks = documentXml.match(pRe) || [];
  const paragraphs = [];

  for (const block of blocks) {
    // 忽略修订删除内容（否则 G13→S50 会拼成 G13S50）
    const cleaned = block
      .replace(/<w:del\b[\s\S]*?<\/w:del>/g, '')
      .replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, '');

    const text = cleaned
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) paragraphs.push(text);
  }

  return paragraphs;
}

export function parseDocCode(docTitle) {
  const m = String(docTitle || '').match(DOC_CODE_RE);
  if (!m) return '';
  return m[1].replace(/[a-z]/g, (ch) => ch.toUpperCase());
}

function isIndicator(text) {
  return Boolean(matchIndicator(text));
}

function isDocTitle(text) {
  return DOC_TITLE_RE.test(String(text || '').trim());
}

function isSectionTitle(text, ctx) {
  if (!ctx.inDetailPart) return false;
  if (isIndicator(text) || isOutlinePartTitle(text) || isDocTitle(text)) return false;
  if (CHECK_SUBPART_RE.test(text)) return false;
  const normalized = normalizeForMatch(text);
  if (new RegExp(`^\\[${INDICATOR_KEY_RE.source}`).test(normalized)) return false;
  if (text.length > 40) return false;
  if (/[。；！？?]$/.test(text)) return false;
  return true;
}

export function parseIndicator(text) {
  const parsed = matchIndicator(text);
  if (!parsed || !parsed.entries?.length) {
    return { indicatorKey: null, indicatorNo: null, indicatorName: '', inlineBody: '', titleText: '' };
  }
  const first = parsed.entries[0];
  const shortKey = stripRomanIndicatorPrefix(first.indicatorKey);
  const indicatorNo = /^\d+$/.test(shortKey) ? Number(shortKey) : null;
  return {
    indicatorKey: first.indicatorKey,
    indicatorNo,
    indicatorName: first.indicatorName.trim(),
    inlineBody: parsed.inlineBody || '',
    titleText: first.titleText,
    entries: parsed.entries,
  };
}

export function expandIndicators(text) {
  const parsed = matchIndicator(text);
  if (!parsed?.entries?.length) return [];
  return parsed.entries.map((entry) => {
    const shortKey = stripRomanIndicatorPrefix(entry.indicatorKey);
    return {
      indicatorKey: entry.indicatorKey,
      indicatorNo: /^\d+$/.test(shortKey) ? Number(shortKey) : null,
      indicatorName: entry.indicatorName.trim(),
      titleText: entry.titleText,
      inlineBody: parsed.inlineBody || '',
    };
  });
}

function createNode(kind, text, extra = {}) {
  return {
    nodeKind: kind,
    text,
    children: [],
    ...extra,
  };
}

function appendToLeafPart(part, extraText) {
  if (!part || !extraText) return;
  part.text = part.text ? `${part.text}\n${extraText}` : extraText;
}

function createDocumentParseState(meta, titleParagraph) {
  const root = createNode('doc_title', meta.docTitle || titleParagraph || '', {
    docCode: meta.docCode || parseDocCode(titleParagraph || ''),
  });
  return {
    root,
    currentPart: null,
    currentSection: null,
    currentIndicator: null,
    mergeTarget: null,
    ctx: { inDetailPart: false },
  };
}

function addTableNodeToParseState(state, rows) {
  state.mergeTarget = null;
  const matrix = rows || [];
  const node = createNode('table', summarizeTableRows(matrix), { tableRows: matrix });

  if (state.ctx.inDetailPart) {
    if (state.currentSection) state.currentSection.children.push(node);
    else if (state.currentPart) state.currentPart.children.push(node);
    else state.root.children.push(node);
    return;
  }
  if (state.currentPart) {
    state.currentPart.children.push(node);
    return;
  }
  state.root.children.push(node);
}

function processParagraphLine(state, text) {
  const { root, ctx } = state;

  function stopMerge() {
    state.mergeTarget = null;
  }
  function setMergeTarget(node) {
    state.mergeTarget = node;
  }
  function addToDetailContainer(node) {
    if (state.currentSection) state.currentSection.children.push(node);
    else if (state.currentPart) state.currentPart.children.push(node);
    else root.children.push(node);
  }
  function startPart(partText) {
    stopMerge();
    state.currentPart = createNode('part', partText);
    root.children.push(state.currentPart);
    state.currentSection = null;
    state.currentIndicator = null;
    ctx.inDetailPart = isDetailPartTitle(partText);
  }

  if (isDocTitle(text)) {
    return 'break';
  }

  if (isOutlinePartTitle(text)) {
    if (
      CHECK_SUBPART_RE.test(text) &&
      state.currentPart &&
      !ctx.inDetailPart &&
      isCheckRelationPart((state.currentPart.text || '').split('\n')[0] || '')
    ) {
      appendToLeafPart(state.currentPart, text);
      return 'continue';
    }
    if (!CHECK_SUBPART_RE.test(text)) {
      startPart(text);
      return 'continue';
    }
    if (state.currentPart && !ctx.inDetailPart) {
      appendToLeafPart(state.currentPart, text);
      return 'continue';
    }
  }

  if (ctx.inDetailPart && isIndicator(text)) {
    stopMerge();
    const expanded = expandIndicators(text);
    let lastMerge = null;
    for (const entry of expanded) {
      state.currentIndicator = createNode('indicator', entry.titleText, {
        indicatorKey: entry.indicatorKey,
        indicatorNo: entry.indicatorNo,
        indicatorName: entry.indicatorName,
      });
      addToDetailContainer(state.currentIndicator);
      if (entry.inlineBody) {
        const body = createNode('body', entry.inlineBody);
        state.currentIndicator.children.push(body);
        lastMerge = body;
      } else {
        lastMerge = state.currentIndicator;
      }
    }
    setMergeTarget(lastMerge);
    return 'continue';
  }

  if (ctx.inDetailPart && isSectionTitle(text, ctx)) {
    stopMerge();
    state.currentSection = createNode('section', text);
    if (state.currentPart) state.currentPart.children.push(state.currentSection);
    else root.children.push(state.currentSection);
    state.currentIndicator = null;
    return 'continue';
  }

  if (ctx.inDetailPart && state.currentIndicator) {
    const body = createNode('body', text);
    state.currentIndicator.children.push(body);
    setMergeTarget(body);
    return 'continue';
  }

  if (ctx.inDetailPart && state.mergeTarget && state.mergeTarget.nodeKind === 'body') {
    state.mergeTarget.text = `${state.mergeTarget.text}${text}`;
    return 'continue';
  }

  if (ctx.inDetailPart) {
    stopMerge();
    const looseBody = createNode('body', text);
    addToDetailContainer(looseBody);
    setMergeTarget(looseBody);
    return 'continue';
  }

  if (state.currentPart) {
    appendToLeafPart(state.currentPart, text);
    return 'continue';
  }

  root.children.push(createNode('body', text));
  return 'continue';
}

/**
 * 将段落序列解析为一棵 document 节点树
 */
export function parseDocumentParagraphs(paragraphs, meta = {}) {
  const state = createDocumentParseState(meta, paragraphs[0] || '');

  for (const text of paragraphs.slice(1)) {
    if (processParagraphLine(state, text) === 'break') break;
  }

  assignLevelsAndPaths(state.root);
  return state.root;
}

/**
 * 按 Word 块顺序解析（含表格节点）
 * @param {Array<{ blockKind: string, text?: string, meta?: { rows?: string[][] } }>} blocks
 */
export function parseDocumentBlocks(blocks, meta = {}) {
  const firstText = blocks.find((b) => b.blockKind !== 'table')?.text || '';
  const state = createDocumentParseState(meta, meta.docTitle || firstText);
  let skippedTitle = false;

  for (const block of blocks) {
    if (block.blockKind === 'table') {
      addTableNodeToParseState(state, block.meta?.rows || []);
      continue;
    }
    const text = block.text;
    if (!text) continue;
    if (!skippedTitle && isDocTitle(text)) {
      skippedTitle = true;
      continue;
    }
    if (processParagraphLine(state, text) === 'break') break;
  }

  assignLevelsAndPaths(state.root);
  return state.root;
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

  node.children.forEach((child) => {
    assignLevelsAndPaths(child, node.path, level + 1, counters);
  });
}

export function splitMergedDocuments(paragraphs) {
  const docs = [];
  let current = null;

  for (const text of paragraphs) {
    if (isDocTitle(text)) {
      if (current) docs.push(current);
      current = {
        docCode: parseDocCode(text),
        docTitle: text,
        paragraphs: [text],
      };
      continue;
    }
    if (current) current.paragraphs.push(text);
  }

  if (current) docs.push(current);
  return docs;
}

export function parseFillInstructionDocumentXml(documentXml) {
  const paragraphs = extractParagraphTexts(documentXml);
  const splitDocs = splitMergedDocuments(paragraphs);

  const documents = splitDocs.map((doc) => ({
    docCode: doc.docCode,
    docTitle: doc.docTitle,
    tree: parseDocumentParagraphs(doc.paragraphs, {
      docCode: doc.docCode,
      docTitle: doc.docTitle,
    }),
  }));

  return { paragraphs, documents };
}

export function countNodes(node) {
  let total = 1;
  const byKind = { [node.nodeKind]: 1 };

  for (const child of node.children || []) {
    const sub = countNodes(child);
    total += sub.total;
    for (const [kind, count] of Object.entries(sub.byKind)) {
      byKind[kind] = (byKind[kind] || 0) + count;
    }
  }

  return { total, byKind };
}

export function collectNodesByKind(node, kind, out = []) {
  if (node.nodeKind === kind) out.push(node);
  for (const child of node.children || []) collectNodesByKind(child, kind, out);
  return out;
}

export function summarizeDocuments(parsed) {
  const documents = Array.isArray(parsed) ? parsed : parsed.documents;
  return documents.map((doc) => {
    const stats = countNodes(doc.tree);
    return {
      docCode: doc.docCode,
      docTitle: doc.docTitle,
      nodeCount: stats.total,
      byKind: stats.byKind,
      indicatorCount: stats.byKind.indicator || 0,
    };
  });
}

export function takeTreePreview(node, limit = 60, state = { n: 0 }) {
  if (state.n >= limit) return null;

  const preview = {
    nodeKind: node.nodeKind,
    level: node.level,
    path: node.path,
    text: node.text.length > 120 ? `${node.text.slice(0, 120)}…` : node.text,
    sortOrder: node.sortOrder,
  };

  if (node.docCode) preview.docCode = node.docCode;
  if (node.indicatorKey != null) preview.indicatorKey = node.indicatorKey;
  if (node.indicatorNo != null) preview.indicatorNo = node.indicatorNo;

  state.n += 1;
  preview.children = [];

  for (const child of node.children || []) {
    if (state.n >= limit) break;
    const childPreview = takeTreePreview(child, limit, state);
    if (childPreview) preview.children.push(childPreview);
  }

  return preview;
}
