/** formTemplateIndicator 单元测试（与前端共用逻辑） */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isClickableIndicatorCell,
  parseIndicatorKeyFromCell,
  resolveIndicatorKeyAtCell,
} from '../../web/src/utils/formTemplateIndicator.js';

describe('formTemplateIndicator', () => {
  it('parseIndicatorKeyFromCell 解析常见序号', () => {
    assert.equal(parseIndicatorKeyFromCell('4. 存放同业款项'), '4');
    assert.equal(parseIndicatorKeyFromCell('4.1 境内商业银行'), '4.1');
    assert.equal(parseIndicatorKeyFromCell('25a.境外分行'), '25a');
  });

  it('G0100 主表 B 列可点击', () => {
    const matrix = [
      ['', '项目', 'A', 'B'],
      [4, '4. 存放同业款项', '', ''],
    ];
    assert.equal(isClickableIndicatorCell(matrix, 1, 1), true);
    assert.equal(resolveIndicatorKeyAtCell(matrix, 1, 1), '4');
  });

  it('G0101A 附表 C 列子项可点击', () => {
    const matrix = [
      ['', '账户类别', '子项', 'A'],
      [4, '存放同业款项', '4.1 境内商业银行', ''],
    ];
    assert.equal(isClickableIndicatorCell(matrix, 1, 1), false);
    assert.equal(isClickableIndicatorCell(matrix, 1, 2), true);
    assert.equal(resolveIndicatorKeyAtCell(matrix, 1, 2), '4.1');
  });

  it('B 列无序号前缀时回退 A 列整数', () => {
    const matrix = [[4, '存放同业款项', '', '']];
    assert.equal(isClickableIndicatorCell(matrix, 0, 1), true);
    assert.equal(resolveIndicatorKeyAtCell(matrix, 0, 1), '4');
  });
});
