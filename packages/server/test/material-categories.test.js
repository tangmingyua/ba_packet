import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MATERIAL_CATEGORIES,
  getCategoryLabel,
  normalizeCategory,
  parseCategoryFilter,
  expandCategoriesForStorage,
} from '../src/config/material-categories.js';

describe('material-categories', () => {
  it('包含七种资料标签（综合合并变更记录与 sql 转换）', () => {
    assert.equal(MATERIAL_CATEGORIES.length, 7);
    assert.deepEqual(
      MATERIAL_CATEGORIES.map((c) => c.label),
      ['规范', '校验', '答疑', '逻辑', '同业经验', '综合', '码值']
    );
  });

  it('normalizeCategory 支持中文与 code，旧标签映射到 composite', () => {
    assert.equal(normalizeCategory('规范'), 'norm');
    assert.equal(normalizeCategory('校验'), 'check');
    assert.equal(normalizeCategory('答疑'), 'qa');
    assert.equal(normalizeCategory('逻辑'), 'logic');
    assert.equal(normalizeCategory('同业经验'), 'peer');
    assert.equal(normalizeCategory('综合'), 'composite');
    assert.equal(normalizeCategory('变更记录'), 'composite');
    assert.equal(normalizeCategory('sql转换'), 'composite');
    assert.equal(normalizeCategory('to1104'), 'composite');
    assert.equal(normalizeCategory('码值'), 'code_value');
    assert.equal(normalizeCategory('check'), 'check');
  });

  it('parseCategoryFilter 去重并过滤非法值', () => {
    assert.deepEqual(parseCategoryFilter('norm,qa,norm'), ['norm', 'qa']);
    assert.deepEqual(parseCategoryFilter(['规范', '答疑']), ['norm', 'qa']);
    assert.deepEqual(parseCategoryFilter('invalid,norm'), ['norm']);
    assert.deepEqual(parseCategoryFilter('to1104'), ['composite']);
  });

  it('expandCategoriesForStorage 展开 composite', () => {
    assert.deepEqual(expandCategoriesForStorage(['composite']), [
      'composite',
      'changelog',
      'to1104',
    ]);
  });

  it('getCategoryLabel', () => {
    assert.equal(getCategoryLabel('peer'), '同业经验');
    assert.equal(getCategoryLabel('composite'), '综合');
    assert.equal(getCategoryLabel('to1104'), '综合');
    assert.equal(getCategoryLabel('unknown'), '规范');
  });
});
