/**
 * Word 结构层：heading / paragraph / table / placeholder
 */

import { buildNumberingLookup, prependListNumberToParagraph } from './word-numbering.js';

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

function endOfOpeningTag(body, start) {
  for (let i = start; i < body.length; i += 1) {
    if (body[i] === '>') return i + 1;
  }
  return -1;
}

/** OOXML 常见空段落：<w:p w14:paraId="…"/> */
function isSelfClosingOpenTag(body, start) {
  for (let i = start; i < body.length; i += 1) {
    if (body[i] === '>') return body[i - 1] === '/';
  }
  return false;
}

function findClosingTag(body, start, tagName) {
  const open = `<${tagName}`;
  const close = `</${tagName}>`;
  if (!isTagOpenAt(body, start, tagName)) return -1;

  if (isSelfClosingOpenTag(body, start)) {
    return endOfOpeningTag(body, start);
  }

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
  let cleaned = blockXml
    .replace(/<w:del\b[\s\S]*?<\/w:del>/g, '')
    .replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, '');

  // 域指令（TOC / HYPERLINK / PAGEREF 等）在 w:instrText 中，不是正文
  cleaned = cleaned.replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/gi, '');

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

/** Word 域代码/目录域指令等（非可见正文） */
function isWordFieldArtifactText(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (/^TOC\s*\\/.test(t)) return true;
  if (/^HYPERLINK\s*\\/.test(t)) return true;
  if (/^PAGEREF\s*\\/.test(t)) return true;
  if (/^REF\s*\\/.test(t)) return true;
  if (/^SEQ\s*\\/.test(t)) return true;
  if (/\\[a-z]+\b/i.test(t) && /(_Toc\d+|bookmark)/i.test(t)) return true;
  return isHyperlinkToc(t);
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

function readTcCell(tcXml) {
  const tcPr = tcXml.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/i)?.[0] || '';
  const gridSpanM = tcPr.match(/<w:gridSpan[^>]*w:val="(\d+)"/i);
  const gridSpan = gridSpanM ? Math.max(1, Number(gridSpanM[1])) : 1;
  let vMerge = null;
  if (/<w:vMerge\b/i.test(tcPr)) {
    const valM = tcPr.match(/<w:vMerge[^>]*w:val="(\w+)"/i);
    vMerge = valM ? valM[1] : 'continue';
  }
  return { text: cellText(tcXml), gridSpan, vMerge };
}

function buildTableWithSpans(rawRows) {
  if (!rawRows.length) return { rows: [], spans: [] };

  let colCount = 0;
  for (const raw of rawRows) {
    let c = 0;
    for (const cell of raw) c += cell.gridSpan || 1;
    colCount = Math.max(colCount, c);
  }

  const rowCount = rawRows.length;
  const texts = Array.from({ length: rowCount }, () => Array(colCount).fill(''));
  const spans = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => ({ skip: false, colspan: 1, rowspan: 1 }))
  );

  for (let ri = 0; ri < rowCount; ri += 1) {
    const raw = rawRows[ri];
    let col = 0;
    for (const cell of raw) {
      while (col < colCount && spans[ri][col].skip) col += 1;
      if (col >= colCount) break;

      const cs = cell.gridSpan || 1;

      if (cell.vMerge === 'continue') {
        for (let k = 0; k < cs && col + k < colCount; k += 1) {
          spans[ri][col + k].skip = true;
        }
        col += cs;
        continue;
      }

      texts[ri][col] = cell.text;
      spans[ri][col].colspan = cs;
      for (let k = 1; k < cs; k += 1) {
        if (col + k < colCount) spans[ri][col + k].skip = true;
      }

      if (cell.vMerge === 'restart') {
        let rowspan = 1;
        for (let rr = ri + 1; rr < rowCount; rr += 1) {
          let c2 = 0;
          let found = false;
          for (const below of rawRows[rr]) {
            while (c2 < colCount && spans[rr][c2].skip) c2 += 1;
            if (c2 === col) {
              found = below.vMerge === 'continue';
              break;
            }
            c2 += below.gridSpan || 1;
          }
          if (!found) break;
          rowspan += 1;
        }
        spans[ri][col].rowspan = rowspan;
        for (let rr = ri + 1; rr < ri + rowspan; rr += 1) {
          for (let k = 0; k < cs && col + k < colCount; k += 1) {
            spans[rr][col + k].skip = true;
          }
        }
      }

      col += cs;
    }
  }

  return { rows: texts, spans };
}

/** @returns {{ rows: string[][], spans: Array<Array<{ skip: boolean, colspan: number, rowspan: number }>> }} */
export function parseTableXml(tblXml) {
  const rawRows = [];
  let pos = 0;
  while (pos < tblXml.length) {
    const trStart = indexOfTagOpen(tblXml, 'w:tr', pos);
    if (trStart === -1) break;
    const trEnd = findClosingTag(tblXml, trStart, 'w:tr');
    if (trEnd === -1) break;
    const trXml = tblXml.slice(trStart, trEnd);
    const cells = [];
    let cpos = 0;
    while (cpos < trXml.length) {
      const tcStart = indexOfTagOpen(trXml, 'w:tc', cpos);
      if (tcStart === -1) break;
      const tcEnd = findClosingTag(trXml, tcStart, 'w:tc');
      if (tcEnd === -1) break;
      cells.push(readTcCell(trXml.slice(tcStart, tcEnd)));
      cpos = tcEnd;
    }
    if (cells.length) rawRows.push(cells);
    pos = trEnd;
  }
  return buildTableWithSpans(rawRows);
}

function cellText(tcXml) {
  const parts = [];
  let pos = 0;
  while (pos < tcXml.length) {
    const pStart = indexOfTagOpen(tcXml, 'w:p', pos);
    if (pStart === -1) break;
    const pEnd = findClosingTag(tcXml, pStart, 'w:p');
    if (pEnd === -1) break;
    const t = paragraphText(tcXml.slice(pStart, pEnd));
    if (t) parts.push(t);
    pos = pEnd;
  }
  return parts.join('\n').trim();
}

export function summarizeTableRows(rows) {
  const matrix = rows || [];
  if (!matrix.length) return '表格';
  const rowCount = matrix.length;
  const colCount = Math.max(...matrix.map((r) => r.length), 0);
  const first = matrix.flat().find((c) => String(c || '').trim());
  if (!first) return `表格（${rowCount}×${colCount}）`;
  const preview = String(first).trim();
  const short = preview.length > 36 ? `${preview.slice(0, 36)}…` : preview;
  return `${short}（${rowCount}×${colCount}）`;
}

export function placeholderText(reportCode) {
  const code = String(reportCode || '').trim();
  return code ? `表样见 ${code} Excel 导入` : '请查看表样';
}

/**
 * @param {string} documentXml
 * @param {{ numberingXml?: string, prependListNumbers?: boolean }} [options]
 * @returns {import('./word-import-pipeline.js').WordBlock[]}
 */
export function extractWordBlocks(documentXml, options = {}) {
  const { numberingXml = '', prependListNumbers = false } = options;
  const numberingLookup = prependListNumbers ? buildNumberingLookup(numberingXml) : null;
  /** @type {Map<string, number[]>} */
  const countersState = new Map();

  const elements = extractBodyElements(documentXml);
  /** @type {import('./word-import-pipeline.js').WordBlock[]} */
  const blocks = [];
  let sortOrder = 0;

  for (const el of elements) {
    if (el.tag === 'tbl') {
      const parsed = parseTableXml(el.xml);
      const rows = parsed.rows;
      if (rows.length) {
        blocks.push({
          blockKind: 'table',
          level: 0,
          sortOrder: sortOrder++,
          text: summarizeTableRows(rows),
          meta: { source: 'word_tbl', rows, tableSpans: parsed.spans },
        });
      } else {
        blocks.push({
          blockKind: 'placeholder',
          level: 0,
          sortOrder: sortOrder++,
          text: placeholderText(''),
          meta: { source: 'word_tbl', placeholderKind: 'form_template', rows: [] },
        });
      }
      continue;
    }

    let text = paragraphText(el.xml);
    if (numberingLookup) {
      text = prependListNumberToParagraph(el.xml, text, numberingLookup, countersState);
    }
    if (!text || isWordFieldArtifactText(text)) continue;

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
