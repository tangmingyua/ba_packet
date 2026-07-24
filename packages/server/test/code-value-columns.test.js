import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCodeValueTableColumns } from '../../web/src/utils/codeValueColumns.js';

describe('buildCodeValueTableColumns', () => {
  it('always shows first three columns without display config', () => {
    const cols = buildCodeValueTableColumns([]);
    assert.deepEqual(
      cols.map((c) => c.key),
      ['dict_name', 'code', 'meaning']
    );
  });

  it('hides extend fields when not configured', () => {
    const cols = buildCodeValueTableColumns([
      { fieldKey: 'extend_2', displayLabel: '币种数字代码', sortOrder: 4, visible: true },
    ]);
    assert.deepEqual(
      cols.map((c) => c.key),
      ['dict_name', 'code', 'meaning', 'extend_2']
    );
    assert.equal(cols.find((c) => c.key === 'extend_2').label, '币种数字代码');
  });

  it('respects visible=false on configured extend fields', () => {
    const cols = buildCodeValueTableColumns([
      { fieldKey: 'extend_1', displayLabel: '预留1', sortOrder: 4, visible: false },
      { fieldKey: 'extend_3', displayLabel: '预留3', sortOrder: 6, visible: true },
    ]);
    assert.deepEqual(
      cols.map((c) => c.key),
      ['dict_name', 'code', 'meaning', 'extend_3']
    );
  });
});
