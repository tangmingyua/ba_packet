/** 1104 表样 ↔ 填报说明代号映射 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultReportCodeForDocCode,
  docCodeToReportCode,
  reportCodeToDocCode,
  normalizeReportCode,
  normalizeReportCodeInput,
} from '../src/config/document-report-mapping.js';

describe('document-report-mapping', () => {
  it('defaultReportCodeForDocCode 仅 G+数字可推导表样', () => {
    assert.equal(defaultReportCodeForDocCode('G01'), 'G0100');
    assert.equal(defaultReportCodeForDocCode('G53'), 'G5300');
    assert.equal(defaultReportCodeForDocCode('GF01'), null);
    assert.equal(defaultReportCodeForDocCode('G01_III'), null);
  });

  it('docCodeToReportCode 兼容旧调用', () => {
    assert.equal(docCodeToReportCode('G01'), 'G0100');
    assert.equal(docCodeToReportCode('GF01'), 'GF01');
  });

  it('reportCodeToDocCode G0100 → G01', () => {
    assert.equal(reportCodeToDocCode('G0100'), 'G01');
    assert.equal(reportCodeToDocCode('G5300'), 'G53');
    assert.equal(reportCodeToDocCode('G100'), 'G01');
    assert.equal(reportCodeToDocCode('G0101A'), null);
  });

  it('normalizeReportCode 规范化表样代号', () => {
    assert.equal(normalizeReportCode('g0100'), 'G0100');
    assert.equal(normalizeReportCode('G01'), 'G0100');
    assert.equal(normalizeReportCodeInput(' g0100 '), 'G0100');
  });
});
