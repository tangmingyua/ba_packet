/** Word 结构层 + Profile 切分导入测试 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupTestDb, teardownTestDb } from './helpers/fixture.js';
import { readDocumentXmlFromDocx } from '../src/services/docx-file.js';
import { parseWordImportDocument, docCodeFromImportFileName } from '../src/services/word-import-pipeline.js';
import { extractWordBlocks, placeholderText } from '../src/services/word-structure-extractor.js';
import { importFillInstructionDocument, listDocuments, getDocument } from '../src/services/document-import.js';
import { queryOne } from '../src/db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_1104 = path.resolve(__dirname, '../../../参考/文档/1104合并填报说明202601.docx');
const DOC_NR = path.resolve(
  __dirname,
  '../../../参考/文档/01采集规范_IMAS-NR_V1.0.4_20260127_填报说明.docx'
);

describe('word-import pipeline', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await setupTestDb();
  });

  after(async () => {
    await teardownTestDb(tmpDir);
  });

  it('placeholderText 带表号或通用文案', () => {
    assert.equal(placeholderText('NR01'), '表样见 NR01 Excel 导入');
    assert.equal(placeholderText(''), '请查看表样');
  });

  it('fallback 说明代号取自文件名而非 DOC', () => {
    assert.equal(docCodeFromImportFileName('数据拆分说明.docx'), '数据拆分说明');
    const xml = readDocumentXmlFromDocx(fs.readFileSync(DOC_1104));
    const parsed = parseWordImportDocument(xml, {
      fileName: '一表通数据拆分.docx',
      profileId: 'generic',
    });
    assert.equal(parsed.profile.id, 'generic');
    assert.equal(parsed.documents[0].docCode, '一表通数据拆分');
  });

  it('1104 Profile 自动切分多条', () => {
    const xml = readDocumentXmlFromDocx(fs.readFileSync(DOC_1104));
    const parsed = parseWordImportDocument(xml, { fileName: '1104合并填报说明202601.docx' });
    assert.equal(parsed.profile.id, '1104-merged');
    assert.equal(parsed.splitMode, 'multi');
    assert.equal(parsed.fallback, false);
    assert.ok(parsed.documents.length >= 10);
    assert.ok(parsed.documents.some((d) => d.docCode === 'G01'));
    const g02 = parsed.documents.find((d) => d.docCode === 'G02');
    assert.ok(g02, '应切出 G02');
    assert.ok(g02.blocks.length > 10, 'G02 应含正文块');
    assert.ok(
      g02.tree.children.length > 0,
      'G02 节点树不应只有标题（合并 Word 中空段落 <w:p/> 不应截断解析）'
    );
  });

  it('extractWordBlocks 忽略 Word 域指令 TOC/HYPERLINK', () => {
    const pXml = `<w:p>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>第一章 概述</w:t></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>TOC \\o "1-3" \\h \\z \\u HYPERLINK \\l "_Toc31517"</w:t></w:r>
    </w:p>`;
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${pXml}<w:sectPr/></w:body>
</w:document>`;
    const blocks = extractWordBlocks(documentXml);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].text, '第一章 概述');
  });

  it('extractWordBlocks 读取整本合并说明（含自闭合 w:p）', () => {
    const xml = readDocumentXmlFromDocx(fs.readFileSync(DOC_1104));
    const blocks = extractWordBlocks(xml);
    assert.ok(blocks.length > 5000, '块数量应接近全书段落规模，而非在首段表格处截断');
    assert.ok(blocks.some((b) => (b.text || '').includes('G02《')), '应包含 G02 标题块');
  });

  it('IMAS-NR Profile 自动切分 NR 表', () => {
    const xml = readDocumentXmlFromDocx(fs.readFileSync(DOC_NR));
    const parsed = parseWordImportDocument(xml, {
      fileName: '01采集规范_IMAS-NR_V1.0.4_20260127_填报说明.docx',
    });
    assert.equal(parsed.profile.id, 'imas-nr');
    assert.equal(parsed.splitMode, 'multi');
    assert.equal(parsed.fallback, false);
    assert.ok(parsed.documents.length >= 15);
    assert.ok(parsed.documents.some((d) => d.docCode === 'NR01'));
    assert.ok(parsed.documents.some((d) => d.docCode === 'NR54'));

    const nr01 = parsed.documents.find((d) => d.docCode === 'NR01');
    assert.ok(nr01);
    assert.ok(parsed.blocks.some((b) => b.blockKind === 'table' && b.meta?.rows?.length));
  });

  it('NR01 标题层级：3.1.2 / 3.1.3 应在 3.1 之下（编号优先于 outline）', () => {
    const xml = readDocumentXmlFromDocx(fs.readFileSync(DOC_NR));
    const parsed = parseWordImportDocument(xml, {
      fileName: '01采集规范_IMAS-NR_V1.0.4_20260127_填报说明.docx',
    });
    const nr01 = parsed.documents.find((d) => d.docCode === 'NR01');
    assert.ok(nr01);

    const headings = nr01.blocks.filter((b) => b.blockKind === 'heading');
    assert.deepEqual(
      headings.map((h) => ({ text: h.text.slice(0, 12), level: h.level })),
      [
        { text: '3.1 NR01 分企业', level: 2 },
        { text: '3.1.1 一般说明', level: 3 },
        { text: '3.1.2 具体说明', level: 3 },
        { text: '3.1.3 校验规则', level: 3 },
      ]
    );

    const section = nr01.tree.children.find((c) => c.nodeKind === 'heading' && c.text.includes('3.1 NR01'));
    assert.ok(section);
    const subTitles = (section.children || [])
      .filter((c) => c.nodeKind === 'heading')
      .map((c) => c.text);
    assert.ok(subTitles.includes('3.1.1 一般说明'));
    assert.ok(subTitles.includes('3.1.2 具体说明'));
    assert.ok(subTitles.includes('3.1.3 校验规则'));
    assert.equal(nr01.tree.children.filter((c) => c.nodeKind === 'heading').length, 1);
  });

  it('importFillInstructionDocument 写入 word_sources 与 NR 映射', () => {
    const result = importFillInstructionDocument(fs.readFileSync(DOC_NR), {
      fileName: '01采集规范_IMAS-NR_V1.0.4_20260127_填报说明.docx',
    });
    assert.equal(result.ok, true);
    assert.equal(result.profileId, 'imas-nr');
    assert.ok(result.sourceId > 0);
    assert.ok(result.documentCount >= 15);

    const source = queryOne('SELECT * FROM word_sources WHERE id = ?', [result.sourceId]);
    assert.ok(source);
    assert.equal(source.profile_id, 'imas-nr');
    assert.equal(source.split_mode, 'multi');

    const nr01Listed = listDocuments().find((d) => d.docCode === 'NR01');
    assert.ok(nr01Listed);
    assert.equal(nr01Listed.reportCode, 'NR01');
    assert.equal(nr01Listed.moduleCode, 'IMAS');

    const full = getDocument(nr01Listed.id);
    assert.ok(full.tree?.children?.some((c) => c.nodeKind === 'heading'));
  });
});
