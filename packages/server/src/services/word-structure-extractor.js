/**
 * Word 结构层：heading / paragraph / placeholder（不解析表格内容）
 */

const HEADING_STYLE_LEVEL = {
  Heading1: 1,
  Heading2: 2,
  Heading3: 3,
  Heading4: 4,
  Heading5: 5,
  Heading6: 6,
  Heading7: 7,
  Heading8: 8,
  Heading9: 9,
  标题1: 1,
  标题2: 2,
  标题3: 3,
  标题4: 4,
  标题5: 5,
  标题6: 6,
  标题7: 7,
  标题8: 8,
  标题9: 9,
};

const HYPERLINK_TOC_RE = /HYPERLINK\s*\\l/i;

function extractBodyInner(documentXml) {
  const start = String(documentXml || '').indexOf('<w:body');
  if (start < 0) return '';
  const openEnd = String(documentXml).indexOf('>', start);
  if (openEnd < 0) return '';
  const close = String(documentXml).lastIndexOf('</w:body>');
  if (close < 0 || close <= openEnd) return '';
  return String(documentXml).slice(openEnd + 1, close);
}

function isTagOpenAt(body, pos, tagName) {
  const open = `<${tagName}`;
  if (!body.startsWith(open, pos)) return false;
  const next = body[pos + open.length];
  return next === ' ' || next === '>' || next === '/';
}

function indexOfTagOpen(body, tagName, fromIndex = 0) {
  const needle = `<${tagName}`;
  let pos = fromIndex;
  while (pos < body.length) {
    pos = body.indexOf(needle, pos);
    if (pos === -1) return -1;
    if (isTagOpenAt(body, pos, tagName)) return pos;
    pos += needle.length;
  }
  return -1;
}

function findClosingTag(body, start, tagName) {
  const open = `<${tagName}`;
  const close = `</${tagName}>`;
  if (!isTagOpenAt(body, start, tagName)) return -1;

  let depth = 1;
  let pos = start + open.length;

  while (pos < body.length) {
    const nextOpen = indexOfTagOpen(body, tagName, pos);
    const nextClose = body.indexOf(close, pos);
    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      pos = nextOpen + open.length;
      continue;
    }

    depth -= 1;
    if (depth === 0) return nextClose + close.length;
    pos = nextClose + close.length;
  }

  return -1;
}

/** @returns {Array<{ tag: 'p' | 'tbl', xml: string }>} */
function extractBodyElements(documentXml) {
  const body = extractBodyInner(documentXml);
  const elements = [];
  let pos = 0;

  while (pos < body.length) {
    const pIdx = indexOfTagOpen(body, 'w:p', pos);
    const tblIdx = indexOfTagOpen(body, 'w:tbl', pos);
    if (pIdx === -1 && tblIdx === -1) break;

    let tag;
    let start;
    if (tblIdx !== -1 && (pIdx === -1 || tblIdx < pIdx)) {
      tag = 'w:tbl';
      start = tblIdx;
    } else {
      tag = 'w:p';
      start = pIdx;
    }

    const end = findClosingTag(body, start, tag);
    if (end === -1) break;
    elements.push({
      tag: tag === 'w:tbl' ? 'tbl' : 'p',
      xml: body.slice(start, end),
    });
    pos = end;
  }

  return elements;
}

function paragraphText(blockXml) {
  const cleaned = blockXml
    .replace(/<w:del\b[\s\S]*?<\/w:del>/g, '')
    .replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, '');

  return cleaned
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function paragraphMeta(blockXml) {
  const styleMatch = blockXml.match(/<w:pStyle[^>]*w:val="([^"]+)"/);
  const outlineMatch = blockXml.match(/<w:outlineLvl[^>]*w:val="([^"]+)"/);
  return {
    styleName: styleMatch ? styleMatch[1] : null,
    outlineLvl: outlineMatch != null ? Number(outlineMatch[1]) + 1 : null,
  };
}

function isHyperlinkToc(text) {
  return HYPERLINK_TOC_RE.test(text) && /bookmark/i.test(text);
}

function headingLevelFromStyle(styleName) {
  if (!styleName) return null;
  return HEADING_STYLE_LEVEL[styleName] ?? null;
}

function headingLevelFromText(text) {
  const t = String(text || '').trim();
  if (!t || isHyperlinkToc(t)) return null;

  if (/^第[一二三四五六七八九十百零]+部分：/.test(t)) return 1;

  const deepNumber = t.match(/^(\d+(?:\.\d+)+)\s+\S/);
  if (deepNumber) return deepNumber[1].split('.').length;

  const sectionNumber = t.match(/^(\d+\.\d+)\s+(NR\d{2}|G\d+|S\d+)/i);
  if (sectionNumber) return 2;

  return null;
}

function resolveHeadingLevel(text, meta) {
  // 方案 A：多级编号优先于 Word outlineLvl / 样式
  const fromNumbering = headingLevelFromText(text);
  if (fromNumbering != null) return fromNumbering;

  if (meta.outlineLvl != null && meta.outlineLvl >= 1 && meta.outlineLvl <= 9) {
    return meta.outlineLvl;
  }
  const fromStyle = headingLevelFromStyle(meta.styleName);
  if (fromStyle) return fromStyle;
  return null;
}

export function placeholderText(reportCode) {
  const code = String(reportCode || '').trim();
  return code ? `表样见 ${code} Excel 导入` : '请查看表样';
}

/**
 * @param {string} documentXml
 * @returns {import('./word-import-pipeline.js').WordBlock[]}
 */
export function extractWordBlocks(documentXml) {
  const elements = extractBodyElements(documentXml);
  /** @type {import('./word-import-pipeline.js').WordBlock[]} */
  const blocks = [];
  let sortOrder = 0;

  for (const el of elements) {
    if (el.tag === 'tbl') {
      blocks.push({
        blockKind: 'placeholder',
        level: 0,
        sortOrder: sortOrder++,
        text: placeholderText(''),
        meta: { source: 'word_tbl', placeholderKind: 'form_template' },
      });
      continue;
    }

    const text = paragraphText(el.xml);
    if (!text) continue;

    const meta = {
      source: 'word_p',
      ...paragraphMeta(el.xml),
    };
    if (isHyperlinkToc(text)) {
      meta.skipInOutline = true;
    }

    const headingLevel = resolveHeadingLevel(text, meta);
    if (headingLevel != null && !meta.skipInOutline) {
      blocks.push({
        blockKind: 'heading',
        level: headingLevel,
        sortOrder: sortOrder++,
        text,
        meta,
      });
    } else {
      blocks.push({
        blockKind: 'paragraph',
        level: 0,
        sortOrder: sortOrder++,
        text,
        meta,
      });
    }
  }

  return blocks;
}

export function blocksToParagraphs(blocks) {
  return (blocks || []).map((b) => b.text).filter(Boolean);
}

export function sampleTextFromBlocks(blocks, limit = 120) {
  const parts = [];
  for (const block of blocks || []) {
    if (block.meta?.skipInOutline) continue;
    parts.push(block.text);
    if (parts.join('\n').length >= 8000) break;
    if (parts.length >= limit) break;
  }
  return parts.join('\n');
}
