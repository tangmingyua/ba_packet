import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MATERIAL_CATEGORIES,
  getCategoryLabel,
  normalizeCategory,
  parseCategoryFilter,
} from '../src/config/material-categories.js';

describe('material-categories', () => {
  it('包含五种资料标签', () => {
    assert.equal(MATERIAL_CATEGORIES.length, 5);
    assert.deepEqual(
      MATERIAL_CATEGORIES.map((c) => c.label),
      ['规范', '校验', '答疑', '逻辑', '同业经验']
    );
  });

  it('normalizeCategory 支持中文与 code', () => {
    assert.equal(normalizeCategory('规范'), 'norm');
    assert.equal(normalizeCategory('校验'), 'check');
    assert.equal(normalizeCategory('答疑'), 'qa');
    assert.equal(normalizeCategory('逻辑'), 'logic');
    assert.equal(normalizeCategory('同业经验'), 'peer');
    assert.equal(normalizeCategory('check'), 'check');
  });

  it('parseCategoryFilter 去重并过滤非法值', () => {
    assert.deepEqual(parseCategoryFilter('norm,qa,norm'), ['norm', 'qa']);
    assert.deepEqual(parseCategoryFilter(['规范', '答疑']), ['norm', 'qa']);
    assert.deepEqual(parseCategoryFilter('invalid,norm'), ['norm']);
  });

  it('getCategoryLabel', () => {
    assert.equal(getCategoryLabel('peer'), '同业经验');
    assert.equal(getCategoryLabel('unknown'), '规范');
  });
});
