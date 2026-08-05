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

/** 表样 cells 索引策略版本（升级后仅启动时全量重建一次） */
export const FORM_TEMPLATE_CELLS_INDEX_VERSION = 2;

const DB_META_KEY_FORM_TEMPLATE_CELLS_INDEX = 'form_template_cells_index_version';

function ensureDbMetaTable() {
  run(`
    CREATE TABLE IF NOT EXISTS db_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

function readFormTemplateCellsIndexVersion() {
  ensureDbMetaTable();
  const row = queryOne(`SELECT value FROM db_meta WHERE key = ?`, [DB_META_KEY_FORM_TEMPLATE_CELLS_INDEX]);
  return Number(row?.value || 0);
}

function writeFormTemplateCellsIndexVersion(version) {
  ensureDbMetaTable();
  run(`INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)`, [
    DB_META_KEY_FORM_TEMPLATE_CELLS_INDEX,
    String(version),
  ]);
}

/** 已有 form_templates 但尚无 cells 时回填；索引策略升级时全量重建一次 */
export function backfillFormTemplateCells() {
  const templates = queryAll('SELECT id, matrix_json FROM form_templates');
  if (!templates.length) return 0;

  const storedVersion = readFormTemplateCellsIndexVersion();
  const needFullReindex = storedVersion < FORM_TEMPLATE_CELLS_INDEX_VERSION;
  let filled = 0;

  run('BEGIN');
  try {
    for (const t of templates) {
      if (!needFullReindex) {
        const hasCells = queryOne(
          'SELECT 1 AS ok FROM form_template_cells WHERE template_id = ? LIMIT 1',
          [t.id]
        );
        if (hasCells) continue;
      }

      let matrix;
      try {
        matrix = JSON.parse(t.matrix_json || '[]');
      } catch {
        continue;
      }

      replaceCellsForTemplate(Number(t.id), matrix);
      filled += 1;
    }
    if (needFullReindex && filled > 0) {
      writeFormTemplateCellsIndexVersion(FORM_TEMPLATE_CELLS_INDEX_VERSION);
    }
    run('COMMIT');
  } catch (error) {
    run('ROLLBACK');
    throw error;
  }

  if (filled > 0) saveDb();
  if (needFullReindex && filled > 0) {
    console.log(`[db] 表样搜索索引已升级至 v${FORM_TEMPLATE_CELLS_INDEX_VERSION}（${filled} 张表样）`);
  }
  return filled;
}
