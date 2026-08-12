import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import XLSX from 'xlsx';
import {
  cellHasHyperlink,
  extractMatchCalls,
  isHyperlinkFormula,
  parseHyperlinkFormula,
  resolveHyperlinkDictName,
} from '../src/utils/excel-cell-hyperlink.js';

describe('excel-cell-hyperlink', () => {
  it('detects native hyperlink and HYPERLINK formula', () => {
    assert.equal(cellHasHyperlink({ l: { Target: 'http://x' } }), true);
    assert.equal(
      cellHasHyperlink({ f: 'HYPERLINK("http://x","详见附录A1 操作类型")', v: '详见附录A1 操作类型' }),
      true
    );
    assert.equal(cellHasHyperlink({ v: '普通文本' }), false);
    assert.equal(isHyperlinkFormula('=HYPERLINK("#A1","text")'), true);
  });

  it('parses HYPERLINK display text', () => {
    const parsed = parseHyperlinkFormula(
      'HYPERLINK("#\'码值\'!A"&MATCH("操作类型",码值!$A:$A,0),"详见附录A1 操作类型")'
    );
    assert.ok(parsed);
    assert.equal(parsed.displayText, '详见附录A1 操作类型');
    assert.match(parsed.targetExpr, /MATCH/i);
  });

  it('extracts MATCH calls from concatenated HYPERLINK target', () => {
    const calls = extractMatchCalls(
      'HYPERLINK("#\'码值\'!A"&MATCH("操作类型",码值!$A:$A,0),"详见附录A1 操作类型")'
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].lookupExpr, '"操作类型"');
    assert.equal(calls[0].rangeExpr, '码值!$A:$A');
    assert.equal(calls[0].matchTypeExpr, '0');
  });

  it('resolves dict name from display text', () => {
    const dict = resolveHyperlinkDictName({
      cell: {
        f: 'HYPERLINK("#码值!A1","详见附录A1 操作类型")',
        v: '详见附录A1 操作类型',
      },
      workbook: { Sheets: {} },
      sheetName: 'Sheet1',
    });
    assert.equal(dict, '操作类型');
  });

  it('resolves dict name from MATCH lookup when display text has no appendix', () => {
    const wb = XLSX.utils.book_new();
    const codeSheet = XLSX.utils.aoa_to_sheet([
      ['名称'],
      ['操作类型'],
      ['币种'],
    ]);
    XLSX.utils.book_append_sheet(wb, codeSheet, '码值');

    const dict = resolveHyperlinkDictName({
      cell: {
        f: 'HYPERLINK("#\'码值\'!A"&MATCH("操作类型",码值!$A:$A,0),"链接")',
        v: '链接',
      },
      workbook: wb,
      sheetName: '业务',
    });
    assert.equal(dict, '操作类型');
  });

  it('resolves dict name from MATCH with cell reference lookup', () => {
    const wb = XLSX.utils.book_new();
    const biz = XLSX.utils.aoa_to_sheet([
      ['码表', '说明'],
      ['币种', ''],
    ]);
    const codeSheet = XLSX.utils.aoa_to_sheet([
      ['名称'],
      ['币种'],
    ]);
    XLSX.utils.book_append_sheet(wb, biz, '业务');
    XLSX.utils.book_append_sheet(wb, codeSheet, '码值');

    const dict = resolveHyperlinkDictName({
      cell: {
        f: 'HYPERLINK("#\'码值\'!A"&MATCH(A2,码值!$A:$A,0),"点我")',
        v: '点我',
      },
      workbook: wb,
      sheetName: '业务',
    });
    assert.equal(dict, '币种');
  });
});
