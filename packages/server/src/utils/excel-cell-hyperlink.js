import XLSX from 'xlsx';
import { extractDictNameFromCellText } from './code-value-dict-name.js';

function normalizeFormula(formula) {
  return String(formula ?? '')
    .trim()
    .replace(/^=/, '');
}

function unquoteExcelString(text) {
  const raw = String(text ?? '').trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    const inner = raw.slice(1, -1);
    if (raw.startsWith('"')) return inner.replace(/""/g, '"');
    return inner.replace(/''/g, "'");
  }
  return raw;
}

/** @param {string} formula @param {number} start */
function readFormulaArg(formula, start) {
  let i = start;
  while (i < formula.length && /\s/.test(formula[i])) i += 1;
  if (i >= formula.length) return null;

  let depth = 0;
  let inString = false;
  let stringChar = '';
  let j = i;

  while (j < formula.length) {
    const c = formula[j];
    if (inString) {
      if (c === stringChar && formula[j + 1] === stringChar) {
        j += 2;
        continue;
      }
      if (c === stringChar) {
        inString = false;
        stringChar = '';
      }
      j += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      stringChar = '"';
      j += 1;
      continue;
    }
    if (c === "'") {
      inString = true;
      stringChar = "'";
      j += 1;
      continue;
    }
    if (c === '(') depth += 1;
    else if (c === ')') {
      if (depth === 0) break;
      depth -= 1;
    } else if (c === ',' && depth === 0) {
      break;
    }
    j += 1;
  }

  return { text: formula.slice(i, j).trim(), next: j };
}

export function isHyperlinkFormula(formula) {
  return /^HYPERLINK\s*\(/i.test(normalizeFormula(formula));
}

/**
 * @param {string} formula
 * @returns {{ targetExpr: string, displayExpr: string, displayText: string } | null}
 */
function displayTextFromExpr(displayExpr) {
  const expr = String(displayExpr ?? '').trim();
  if (
    (expr.startsWith('"') && expr.endsWith('"')) ||
    (expr.startsWith("'") && expr.endsWith("'"))
  ) {
    return unquoteExcelString(expr);
  }
  return '';
}

export function parseHyperlinkFormula(formula) {
  const f = normalizeFormula(formula);
  const head = /^HYPERLINK\s*\(/i.exec(f);
  if (!head) return null;

  const arg1 = readFormulaArg(f, head.index + head[0].length);
  if (!arg1) return null;

  let pos = arg1.next;
  while (pos < f.length && /\s/.test(f[pos])) pos += 1;
  if (f[pos] !== ',') return null;
  pos += 1;

  const arg2 = readFormulaArg(f, pos);
  if (!arg2) return null;

  const displayText = displayTextFromExpr(arg2.text);
  return {
    targetExpr: arg1.text.trim(),
    displayExpr: arg2.text.trim(),
    displayText,
  };
}

/**
 * @param {string} formula
 * @returns {{ lookupExpr: string, rangeExpr: string, matchTypeExpr: string }[]}
 */
export function extractMatchCalls(formula) {
  const f = normalizeFormula(formula);
  const upper = f.toUpperCase();
  /** @type {{ lookupExpr: string, rangeExpr: string, matchTypeExpr: string }[]} */
  const calls = [];
  let searchFrom = 0;

  while (searchFrom < f.length) {
    const idx = upper.indexOf('MATCH(', searchFrom);
    if (idx < 0) break;
    const arg1 = readFormulaArg(f, idx + 'MATCH('.length);
    if (!arg1) break;
    let pos = arg1.next;
    while (pos < f.length && /\s/.test(f[pos])) pos += 1;
    if (f[pos] !== ',') {
      searchFrom = idx + 6;
      continue;
    }
    pos += 1;
    const arg2 = readFormulaArg(f, pos);
    if (!arg2) break;
    pos = arg2.next;
    while (pos < f.length && /\s/.test(f[pos])) pos += 1;
    if (f[pos] !== ',') {
      searchFrom = idx + 6;
      continue;
    }
    pos += 1;
    const arg3 = readFormulaArg(f, pos);
    if (!arg3) break;
    calls.push({
      lookupExpr: arg1.text.trim(),
      rangeExpr: arg2.text.trim(),
      matchTypeExpr: arg3.text.trim(),
    });
    searchFrom = idx + 6;
  }

  return calls;
}

/** @param {string} rangeExpr */
function parseSheetRange(rangeExpr) {
  const raw = String(rangeExpr ?? '').trim();
  const bang = raw.lastIndexOf('!');
  if (bang < 0) return { sheetName: '', range: raw };
  let sheetName = raw.slice(0, bang).trim();
  if (sheetName.startsWith("'") && sheetName.endsWith("'")) {
    sheetName = sheetName.slice(1, -1).replace(/''/g, "'");
  }
  return { sheetName, range: raw.slice(bang + 1).trim() };
}

function decodeCol(colLetters) {
  let n = 0;
  for (const ch of colLetters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** @param {string} ref */
function parseCellRef(ref) {
  const m = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(String(ref ?? '').trim());
  if (!m) return null;
  return { col: decodeCol(m[2]), row: Number(m[4]) - 1 };
}

/** @param {string} range */
function parseColumnRange(range) {
  const m = /^\$?([A-Za-z]+):\$?\1$/.exec(String(range ?? '').trim());
  if (!m) return null;
  return decodeCol(m[1]);
}

function readWorkbookCellValue(workbook, sheetName, row, col) {
  const sheet = workbook?.Sheets?.[sheetName];
  if (!sheet) return '';
  const ref = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[ref];
  if (!cell) return '';
  if (cell.v != null && cell.v !== '') return String(cell.v).trim();
  if (cell.w != null && cell.w !== '') return String(cell.w).trim();
  return '';
}

function resolveLookupValue(lookupExpr, { workbook, sheetName }) {
  const expr = String(lookupExpr ?? '').trim();
  if (!expr) return '';

  if (
    (expr.startsWith('"') && expr.endsWith('"')) ||
    (expr.startsWith("'") && expr.endsWith("'"))
  ) {
    return unquoteExcelString(expr);
  }

  const cellRef = parseCellRef(expr);
  if (cellRef) {
    return readWorkbookCellValue(workbook, sheetName, cellRef.row, cellRef.col);
  }

  return expr;
}

function findExactMatchInColumn(workbook, sheetName, colIndex, lookupValue) {
  const sheet = workbook?.Sheets?.[sheetName];
  if (!sheet || !lookupValue) return null;

  const ref = sheet['!ref'];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const value = readWorkbookCellValue(workbook, sheetName, r, colIndex);
    if (value === lookupValue) {
      return { row: r, value };
    }
  }
  return null;
}

/**
 * @param {{ lookupExpr: string, rangeExpr: string, matchTypeExpr: string }} matchCall
 */
function evaluateMatchCall(matchCall, context) {
  const lookupValue = resolveLookupValue(matchCall.lookupExpr, context);
  if (!lookupValue) return null;

  const { sheetName, range } = parseSheetRange(matchCall.rangeExpr);
  const targetSheet = sheetName || context.sheetName;
  const colIndex = parseColumnRange(range);
  if (colIndex == null) {
    return { lookupValue, matchedValue: lookupValue };
  }

  const hit = findExactMatchInColumn(context.workbook, targetSheet, colIndex, lookupValue);
  if (!hit) {
    return { lookupValue, matchedValue: lookupValue };
  }

  const matchedValue = readWorkbookCellValue(context.workbook, targetSheet, hit.row, colIndex);
  return { lookupValue, matchedValue: matchedValue || lookupValue };
}

export function cellHasHyperlink(cell) {
  if (!cell) return false;
  if (cell.l?.Target) return true;
  return isHyperlinkFormula(cell.f);
}

/**
 * 解析单元格超链接对应的码表名称（用于码值查询）。
 * 优先 display 文本；其次 MATCH 查找值 / 命中行内容。
 */
export function resolveHyperlinkDictName({ cell, workbook, sheetName }) {
  if (!cellHasHyperlink(cell)) return null;

  const context = { workbook, sheetName };
  const displayText =
    cell.v != null && String(cell.v).trim()
      ? String(cell.v).trim()
      : parseHyperlinkFormula(cell.f)?.displayText || '';

  const formula = cell.f || '';
  const matchCalls = extractMatchCalls(formula);
  for (const matchCall of matchCalls) {
    const result = evaluateMatchCall(matchCall, context);
    if (!result) continue;
    const candidate = String(result.matchedValue || result.lookupValue || '').trim();
    if (!candidate) continue;
    const fromMatch = extractDictNameFromCellText(candidate) || candidate;
    if (fromMatch) return fromMatch;
  }

  const fromDisplay = extractDictNameFromCellText(displayText);
  if (fromDisplay) return fromDisplay;

  return null;
}

export { normalizeFormula, unquoteExcelString };
