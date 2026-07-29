import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractDictNameFromCellText } from '../src/utils/code-value-dict-name.js';

describe('extractDictNameFromCellText', () => {
  it('extracts dict name after 详见附录A1 with optional space', () => {
    assert.equal(extractDictNameFromCellText('详见附录A1 操作类型'), '操作类型');
    assert.equal(extractDictNameFromCellText('详见附录A1操作类型'), '操作类型');
  });

  it('strips trailing punctuation', () => {
    assert.equal(extractDictNameFromCellText('详见附录A1 国家（地区）代码；'), '国家（地区）代码');
    assert.equal(extractDictNameFromCellText('详见附录A1 操作类型。'), '操作类型');
  });

  it('uses the last appendix prefix in mixed text', () => {
    assert.equal(
      extractDictNameFromCellText('当"划转用途"以"7"开头时，必填。详见附录A1资金划转业务种类代码'),
      '资金划转业务种类代码'
    );
  });

  it('uses full cell text when appendix prefix is missing', () => {
    assert.equal(extractDictNameFromCellText('操作类型'), '操作类型');
    assert.equal(extractDictNameFromCellText('10.4 特殊经济区类型'), '10.4 特殊经济区类型');
    assert.equal(extractDictNameFromCellText('10.4 特殊经济区类型；'), '10.4 特殊经济区类型');
  });

  it('returns null when cell text empty or only appendix prefix', () => {
    assert.equal(extractDictNameFromCellText('详见附录A1'), null);
    assert.equal(extractDictNameFromCellText(''), null);
    assert.equal(extractDictNameFromCellText(null), null);
  });

  it('supports custom prefix list for future appendix codes', () => {
    assert.equal(
      extractDictNameFromCellText('详见附录A2 币种', ['详见附录A2', '详见附录A1']),
      '币种'
    );
  });
});
