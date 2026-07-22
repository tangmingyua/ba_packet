/**
 * 1104 表样可搜索单元格索引：导入时从 matrix 提取，搜索阶段直接查表
 */
import { queryAll, queryOne, run, saveDb } from '../db/database.js';
import { forEachSearchableCell } from './form-template-search-scope.js';

/**
 * @param {unknown[][]} matrix
 * @returns {{ rowIndex: number, colIndex: number, cellText: string, cellKind: string }[]}
 */
export function extractSearchableCells(matrix) {
  const cells = [];
  forEachSearchableCell(matrix, ({ row, col, text, cellKind }) => {
    cells.push({
      rowIndex: row,
      colIndex: col,
      cellText: text,
      cellKind,
    });
  });
  return cells;
}

/** 删除并重建某表样的 cells 索引 */
export function replaceCellsForTemplate(templateId, matrix) {
  const id = Number(templateId);
  run('DELETE FROM form_template_cells WHERE template_id = ?', [id]);

  const cells = extractSearchableCells(matrix);
  for (const cell of cells) {
    run(
      `INSERT INTO form_template_cells (
         template_id, row_index, col_index, cell_text, cell_kind, searchable
       ) VALUES (?, ?, ?, ?, ?, 1)`,
      [id, cell.rowIndex, cell.colIndex, cell.cellText, cell.cellKind]
    );
  }
}

export function countCellsForTemplate(templateId) {
  const row = queryOne(
    'SELECT COUNT(*) AS c FROM form_template_cells WHERE template_id = ?',
    [Number(templateId)]
  );
  return Number(row?.c || 0);
}

/** 已有 form_templates 但尚无 cells 时回填 */
export function backfillFormTemplateCells() {
  const templates = queryAll('SELECT id, matrix_json FROM form_templates');
  let filled = 0;

  for (const t of templates) {
    const hasCells = queryOne(
      'SELECT 1 AS ok FROM form_template_cells WHERE template_id = ? LIMIT 1',
      [t.id]
    );
    if (hasCells) continue;

    let matrix;
    try {
      matrix = JSON.parse(t.matrix_json || '[]');
    } catch {
      continue;
    }

    replaceCellsForTemplate(Number(t.id), matrix);
    filled += 1;
  }

  if (filled > 0) saveDb();
  return filled;
}
