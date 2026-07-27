import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  alignForCellKind,
  buildFormTemplateLayout,
  getLayoutCellPresentation,
  buildMergeRenderMap,
} from '../src/services/form-template-layout.js';

describe('form-template-layout', () => {
  const matrix = [
    ['G01资产负债项目统计表', '', '', ''],
    ['', '项目', 'A', 'B'],
    [1, '1. 现金', '', ''],
    [2, '2. 存放中央银行款项', '', '100'],
  ];
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];

  it('buildFormTemplateLayout stores per-cell kinds and col widths', () => {
    const layout = buildFormTemplateLayout(matrix, merges);
    assert.equal(layout.v, 1);
    assert.equal(layout.firstDataRow, 2);
    assert.equal(layout.kinds[0][0], 'title');
    assert.equal(layout.kinds[1][2], 'header');
    assert.equal(layout.kinds[2][1], 'label');
    assert.equal(layout.kinds[3][3], 'value');
    assert.ok(layout.colWidths[1] >= 220);
  });

  it('getLayoutCellPresentation uses stored kind for align', () => {
    const layout = buildFormTemplateLayout(matrix, merges);
    const renderMap = buildMergeRenderMap(merges);
    const title = getLayoutCellPresentation(layout, renderMap, 0, 0);
    assert.equal(title.kind, 'title');
    assert.equal(title.align, 'center');
    const value = getLayoutCellPresentation(layout, renderMap, 3, 3);
    assert.equal(value.kind, 'value');
    assert.equal(value.align, 'right');
  });

  it('alignForCellKind', () => {
    assert.equal(alignForCellKind('label', { col: 1 }), 'left');
    assert.equal(alignForCellKind('section', { col: 0, colspan: 3 }), 'center');
  });
});
