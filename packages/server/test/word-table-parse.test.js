import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTableXml, summarizeTableRows } from '../src/services/word-structure-extractor.js';
import { parseDocumentBlocks } from '../src/services/docx-fill-instruction-parser.js';

test('parseTableXml extracts cell text by row', () => {
  const tbl = `
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>列A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>列B</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>`;
  assert.deepEqual(parseTableXml(tbl).rows, [
    ['列A', '列B'],
    ['1', '2'],
  ]);
});

test('parseTableXml applies gridSpan colspan', () => {
  const tbl = `
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:tcPr><w:gridSpan w:val="2"/></w:tcPr>
          <w:p><w:r><w:t>合并</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>`;
  const parsed = parseTableXml(tbl);
  assert.equal(parsed.rows[0][0], '合并');
  assert.equal(parsed.spans[0][0].colspan, 2);
  assert.equal(parsed.spans[0][1].skip, true);
});

test('parseDocumentBlocks inserts table node under current part', () => {
  const blocks = [
    { blockKind: 'paragraph', text: 'G01《测试》填报说明' },
    { blockKind: 'paragraph', text: '第一部分：具体说明' },
    {
      blockKind: 'table',
      text: summarizeTableRows([['指标', '说明'], ['A', '内容']]),
      meta: { rows: [['指标', '说明'], ['A', '内容']] },
    },
  ];
  const tree = parseDocumentBlocks(blocks, { docCode: 'G01', docTitle: blocks[0].text });
  const part = tree.children.find((c) => c.nodeKind === 'part');
  assert.ok(part);
  const table = part.children.find((c) => c.nodeKind === 'table');
  assert.ok(table);
  assert.equal(table.tableRows.length, 2);
});
