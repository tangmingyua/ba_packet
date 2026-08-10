import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSearchFieldCodes } from '../src/services/search-fields.js';

describe('search-fields', () => {
  it('查规范搜索字段', () => {
    assert.deepEqual(getSearchFieldCodes('norm'), [
      'data_item',
      'table_name',
      'table_name_main',
      'data_element_desc',
    ]);
  });

  it('查答疑搜索字段', () => {
    assert.deepEqual(getSearchFieldCodes('qa'), [
      'data_item',
      'table_name',
      'table_name_main',
      'question_desc',
    ]);
  });

  it('聚合查询合并字段', () => {
    assert.deepEqual(getSearchFieldCodes('aggregate'), [
      'data_item',
      'table_name',
      'table_name_main',
      'data_element_desc',
      'question_desc',
    ]);
  });

  it('resolveSuggestTableNameFromPayload 优先表名再表名（主）', async () => {
    const { resolveSuggestTableNameFromPayload } = await import('../src/services/search-fields.js');
    assert.equal(
      resolveSuggestTableNameFromPayload({ table_name: '  A表 ', table_name_main: 'B表' }),
      'A表'
    );
    assert.equal(resolveSuggestTableNameFromPayload({ table_name_main: '主表' }), '主表');
    assert.equal(resolveSuggestTableNameFromPayload({}), '');
  });
});
