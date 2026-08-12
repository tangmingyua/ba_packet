import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SYSTEM_SUBTYPES,
  resolveSubtypeCode,
  getStorageKindLabel,
  isSystemSubtypeCode,
} from '../src/config/system-subtypes.js';

describe('system-subtypes', () => {
  it('resolveSubtypeCode 按存储形态与模块解析', () => {
    assert.equal(resolveSubtypeCode('form_template', '1104'), '1104_FORM_TEMPLATE');
    assert.equal(resolveSubtypeCode('document', '1104'), '1104_FILL_INSTRUCTION');
    assert.equal(resolveSubtypeCode('script', 'YBT'), 'CONVERSION_SCRIPT');
    assert.equal(resolveSubtypeCode('code_value', 'YBT'), 'YBT_CODE_VALUE');
    assert.equal(resolveSubtypeCode('excel', 'YBT'), '');
  });

  it('系统子类包含表样、说明、脚本与各模块码值', () => {
    const codes = SYSTEM_SUBTYPES.map((s) => s.code);
    assert.ok(codes.includes('1104_FORM_TEMPLATE'));
    assert.ok(codes.includes('1104_FILL_INSTRUCTION'));
    assert.ok(codes.includes('CONVERSION_SCRIPT'));
    assert.ok(codes.includes('YBT_CODE_VALUE'));
    assert.equal(
      SYSTEM_SUBTYPES.find((s) => s.code === '1104_FORM_TEMPLATE')?.category,
      'norm'
    );
    assert.equal(
      SYSTEM_SUBTYPES.find((s) => s.code === 'CONVERSION_SCRIPT')?.category,
      'composite'
    );
    assert.equal(
      SYSTEM_SUBTYPES.find((s) => s.code === 'YBT_CODE_VALUE')?.category,
      'code_value'
    );
  });

  it('isSystemSubtypeCode 与 storageKind 标签', () => {
    assert.equal(isSystemSubtypeCode('1104_FORM_TEMPLATE'), true);
    assert.equal(isSystemSubtypeCode('YBT_NORM'), false);
    assert.equal(getStorageKindLabel('form_template'), '表样 Excel 类');
    assert.equal(getStorageKindLabel('code_value'), '码值');
  });

  it('listCreatableStorageKinds 含四种解析方式', async () => {
    const { listCreatableStorageKinds } = await import('../src/config/system-subtypes.js');
    const codes = listCreatableStorageKinds().map((k) => k.code);
    assert.ok(codes.includes('excel'));
    assert.ok(codes.includes('form_template'));
    assert.ok(codes.includes('document'));
    assert.ok(codes.includes('word_faithful'));
    assert.ok(codes.includes('script'));
  });
});
