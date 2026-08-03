/**
 * 1104 表样展示布局：导入时从 matrix + merges 计算并持久化（方案 B）
 */
import { cellText, isIndicatorDataRow } from './form-template-search-scope.js';

export const LAYOUT_VERSION = 1;

/** @typedef {'title'|'section'|'header'|'seq'|'label'|'value'|'text'|'empty'} CellKind */

const SECTION_TEXT_RE =
  /^(表[一二三四五六七八九十\d零〇]+[：:])|^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.．]|^附表/i;

const COLUMN_HEADER_TEXT_RE =
  /^(项目|序号|代码|名称|栏次|甲|乙|丙|A|B|C|D|E|F|G|H)$/i;

/**
 * @param {{ s: { r: number, c: number }, e: { r: number, c: number } }}[] merges
 */
export function buildMergeRenderMap(merges = []) {
  const covered = new Set();
  const spanAt = new Map();

  for (const m of merges) {
    const rowspan = m.e.r - m.s.r + 1;
    const colspan = m.e.c - m.s.c + 1;
    spanAt.set(`${m.s.r},${m.s.c}`, { rowspan, colspan });
    for (let r = m.s.r; r <= m.e.r; r += 1) {
      for (let c = m.s.c; c <= m.e.c; c += 1) {
        if (r !== m.s.r || c !== m.s.c) {
          covered.add(`${r},${c}`);
        }
      }
    }
  }

  return { covered, spanAt };
}

export function matrixColumnCount(matrix) {
  let max = 0;
  for (const row of matrix || []) {
    max = Math.max(max, row?.length || 0);
  }
  return max;
}

export function findFirstIndicatorDataRow(matrix) {
  if (!matrix?.length) return 0;
  for (let r = 0; r < matrix.length; r += 1) {
    if (isIndicatorDataRow(matrix, r)) return r;
  }
  return matrix.length;
}

function isNumericLike(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return /^-?\d+(?:\.\d+)?$/.test(t);
}

function rowHasSectionText(matrix, rowIndex) {
  const line = matrix[rowIndex] || [];
  for (const cell of line) {
    const text = cellText(cell);
    if (text && SECTION_TEXT_RE.test(text)) return true;
  }
  return false;
}

function rowHasWideMerge(rowIndex, renderMap, colCount) {
  for (const [key, span] of renderMap.spanAt.entries()) {
    const [r] = key.split(',').map(Number);
    if (r !== rowIndex) continue;
    if ((span.colspan || 1) >= Math.max(3, Math.ceil(colCount * 0.35))) return true;
  }
  return false;
}

function rowHasAnyText(matrix, rowIndex) {
  const line = matrix[rowIndex] || [];
  return line.some((cell) => cellText(cell) !== '');
}

/**
 * @param {unknown[][]} matrix
 * @param {ReturnType<typeof buildMergeRenderMap>} renderMap
 * @param {number} colCount
 */
function classifyRowKinds(matrix, renderMap, colCount) {
  const firstDataRow = findFirstIndicatorDataRow(matrix);
  const rowKinds = [];

  for (let r = 0; r < matrix.length; r += 1) {
    if (isIndicatorDataRow(matrix, r)) {
      rowKinds[r] = 'data';
      continue;
    }
    if (r === 0 || rowHasWideMerge(r, renderMap, colCount)) {
      rowKinds[r] = 'title';
    } else if (rowHasSectionText(matrix, r)) {
      rowKinds[r] = 'section';
    } else if (r < firstDataRow) {
      rowKinds[r] = 'header';
    } else if (rowHasAnyText(matrix, r)) {
      rowKinds[r] = 'section';
    } else {
      rowKinds[r] = 'blank';
    }
  }

  return { firstDataRow, rowKinds };
}

/**
 * @param {unknown[][]} matrix
 * @param {string[]} rowKinds
 * @param {number} row
 * @param {number} col
 * @param {ReturnType<typeof buildMergeRenderMap>} renderMap
 */
function classifyCellKind(matrix, rowKinds, row, col, renderMap) {
  const text = cellText(matrix[row]?.[col]);
  const rowKind = rowKinds[row] || 'blank';
  const span = renderMap.spanAt.get(`${row},${col}`);
  const colspan = span?.colspan || 1;

  if (rowKind === 'data') {
    if (!text) return col >= 3 ? 'value' : 'empty';
    if (col === 0) return 'seq';
    if (col === 1 || col === 2) return 'label';
    if (col >= 3 && isNumericLike(text)) return 'value';
    return col >= 3 ? 'text' : 'label';
  }

  if (rowKind === 'title') {
    return text ? 'title' : 'empty';
  }

  if (rowKind === 'section') {
    return text ? 'section' : 'empty';
  }

  if (rowKind === 'header') {
    if (!text) return 'empty';
    if (COLUMN_HEADER_TEXT_RE.test(text) || (text.length <= 4 && col >= 2)) {
      return 'header';
    }
    if (colspan >= 2) return 'section';
    return 'header';
  }

  if (rowKind === 'blank') {
    return 'empty';
  }

  if (!text) return 'empty';
  if (colspan >= 2) return 'section';
  if (isNumericLike(text) && col >= 2) return 'value';
  return 'text';
}

/**
 * @param {CellKind} kind
 * @param {{ col: number, colspan?: number }} ctx
 */
export function alignForCellKind(kind, ctx = {}) {
  const col = ctx.col ?? 0;
  const colspan = ctx.colspan || 1;

  switch (kind) {
    case 'title':
      return 'center';
    case 'section':
      return colspan >= 2 ? 'center' : 'left';
    case 'header':
      return col >= 2 || colspan >= 2 ? 'center' : 'left';
    case 'seq':
      return 'center';
    case 'value':
      return 'right';
    default:
      return 'left';
  }
}

/**
 * @param {unknown[][]} matrix
 * @param {CellKind[][]} kinds
 * @param {number} colCount
 */
function computeColumnWidths(matrix, kinds, colCount) {
  const widths = Array.from({ length: colCount }, () => 72);

  for (let c = 0; c < colCount; c += 1) {
    if (c === 0) {
      widths[c] = 56;
      continue;
    }

    let maxChars = 0;
    for (let r = 0; r < matrix.length; r += 1) {
      const kind = kinds[r]?.[c] || 'empty';
      if (kind === 'empty' || kind === 'value') continue;
      maxChars = Math.max(maxChars, cellText(matrix[r]?.[c]).length);
    }

    if (c === 1 || c === 2) {
      widths[c] = Math.min(680, Math.max(220, maxChars * 9 + 32));
    } else {
      widths[c] = Math.min(160, Math.max(84, Math.min(maxChars * 8 + 24, 120)));
    }
  }

  return widths;
}

/**
 * @param {unknown[][]} matrix
 * @param {{ s: { r: number, c: number }, e: { r: number, c: number } }[]} merges
 */
export function buildFormTemplateLayout(matrix, merges = [], dimensions = {}) {
  const renderMap = buildMergeRenderMap(merges);
  const colCount = matrixColumnCount(matrix);
  const { firstDataRow, rowKinds } = classifyRowKinds(matrix, renderMap, colCount);

  const kinds = [];
  for (let r = 0; r < matrix.length; r += 1) {
    const rowKindsRow = [];
    const rowLen = matrix[r]?.length || 0;
    for (let c = 0; c < colCount; c += 1) {
      if (c >= rowLen) {
        rowKindsRow.push('empty');
      } else {
        rowKindsRow.push(classifyCellKind(matrix, rowKinds, r, c, renderMap));
      }
    }
    kinds.push(rowKindsRow);
  }

  const colWidths =
    Array.isArray(dimensions.colWidths) && dimensions.colWidths.length === colCount
      ? dimensions.colWidths
      : computeColumnWidths(matrix, kinds, colCount);
  const rowHeights =
    Array.isArray(dimensions.rowHeights) && dimensions.rowHeights.length === matrix.length
      ? dimensions.rowHeights
      : [];

  return {
    v: LAYOUT_VERSION,
    firstDataRow,
    kinds,
    colWidths,
    rowHeights,
  };
}

export function parseFormTemplateLayoutJson(raw, matrix, merges, dimensions = {}) {
  if (!raw || raw === '{}') {
    return buildFormTemplateLayout(matrix, merges, dimensions);
  }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed?.v === LAYOUT_VERSION && Array.isArray(parsed.kinds) && parsed.kinds.length) {
      // 存量 layout_json 没有原生尺寸，用传入的 dimensions 补全
      if (!parsed.rowHeights?.length && dimensions.rowHeights?.length) {
        parsed.rowHeights = dimensions.rowHeights;
      }
      if (!parsed.colWidths?.length && dimensions.colWidths?.length) {
        parsed.colWidths = dimensions.colWidths;
      }
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return buildFormTemplateLayout(matrix, merges, dimensions);
}

/**
 * @param {ReturnType<typeof buildFormTemplateLayout>} layout
 * @param {ReturnType<typeof buildMergeRenderMap>} renderMap
 */
export function getLayoutCellPresentation(layout, renderMap, row, col) {
  const kind = layout?.kinds?.[row]?.[col] || 'text';
  const span = renderMap.spanAt.get(`${row},${col}`);
  return {
    kind,
    align: alignForCellKind(kind, { col, colspan: span?.colspan }),
  };
}

/** 已有表样缺 layout_json 时回填 */
export function backfillFormTemplateLayouts(dbHelpers) {
  const { queryAll, run, saveDb } = dbHelpers;
  const templates = queryAll(
    'SELECT id, matrix_json, merges_json, layout_json, col_widths_json, row_heights_json FROM form_templates'
  );
  let filled = 0;

  for (const t of templates) {
    const raw = String(t.layout_json || '').trim();
    if (raw && raw !== '{}') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.v === LAYOUT_VERSION && parsed.kinds?.length) continue;
      } catch {
        /* rebuild */
      }
    }

    let matrix;
    let merges;
    let colWidths;
    let rowHeights;
    try {
      matrix = JSON.parse(t.matrix_json || '[]');
      merges = JSON.parse(t.merges_json || '[]');
      colWidths = JSON.parse(t.col_widths_json || '[]');
      rowHeights = JSON.parse(t.row_heights_json || '[]');
    } catch {
      continue;
    }

    const layout = buildFormTemplateLayout(matrix, merges, { colWidths, rowHeights });
    run('UPDATE form_templates SET layout_json = ? WHERE id = ?', [
      JSON.stringify(layout),
      t.id,
    ]);
    filled += 1;
  }

  if (filled > 0) saveDb();
  return filled;
}
