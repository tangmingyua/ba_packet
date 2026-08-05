import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import { detectWordFileFormat, readDocumentXmlFromDocx } from '../src/services/docx-file.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_DOCX = path.resolve(
  __dirname,
  '../../../参考/文档/1104合并填报说明202601.docx'
);

describe('docx-file', () => {
  it('detectWordFileFormat 识别 docx 与 doc 文件头', () => {
    if (!fs.existsSync(SAMPLE_DOCX)) return;
    const docx = fs.readFileSync(SAMPLE_DOCX);
    assert.equal(detectWordFileFormat(docx), 'docx');
    assert.equal(detectWordFileFormat(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0])), 'doc');
    assert.equal(detectWordFileFormat(Buffer.from('hello')), 'unknown');
  });

  it('readDocumentXmlFromDocx 读取 word/document.xml', () => {
    if (!fs.existsSync(SAMPLE_DOCX)) return;
    const xml = readDocumentXmlFromDocx(fs.readFileSync(SAMPLE_DOCX));
    assert.match(xml, /<w:document[\s>]/);
  });

  it('readDocumentXmlFromDocx 对 .doc 给出明确提示', () => {
    assert.throws(
      () => readDocumentXmlFromDocx(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00])),
      /不支持旧版 Word 的 \.doc/
    );
  });
});
