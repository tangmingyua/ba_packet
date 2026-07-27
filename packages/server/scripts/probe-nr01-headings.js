/**
 * 探针：NR01 标题层级识别
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readDocumentXmlFromDocx } from '../src/services/docx-file.js';
import { extractWordBlocks } from '../src/services/word-structure-extractor.js';
import { parseWordImportDocument } from '../src/services/word-import-pipeline.js';
import { setupTestDb, teardownTestDb } from '../test/helpers/fixture.js';
import { importFillInstructionDocument, getDocument } from '../src/services/document-import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_NR = path.resolve(__dirname, '../../../参考/文档/01采集规范_IMAS-NR_V1.0.4_20260127_填报说明.docx');

const xml = readDocumentXmlFromDocx(fs.readFileSync(DOC_NR));
const parsed = parseWordImportDocument(xml, { fileName: 'nr.docx' });
const nr01 = parsed.documents.find((d) => d.docCode === 'NR01');

console.log('=== NR01 heading blocks (block.level) ===');
for (const b of nr01.blocks) {
  if (b.blockKind !== 'heading') continue;
  console.log({
    sortOrder: b.sortOrder,
    level: b.level,
    text: b.text.slice(0, 55),
    styleName: b.meta?.styleName,
    outlineLvl: b.meta?.outlineLvl,
  });
}

const tmp = await setupTestDb();
importFillInstructionDocument(fs.readFileSync(DOC_NR), { fileName: 'nr.docx' });
const doc = getDocument(1);

console.log('\n=== document_nodes tree (heading levels) ===');
function walk(node, depth = 0) {
  if (node.nodeKind === 'heading' || node.nodeKind === 'doc_title') {
    console.log(`${'  '.repeat(depth)}${node.nodeKind} L${node.level} | ${node.text.slice(0, 55)}`);
  }
  for (const c of node.children || []) walk(c, depth + 1);
}
walk(doc.tree);

const bodyStart = xml.indexOf('<w:body');
const bodyEnd = xml.lastIndexOf('</w:body>');
const body = xml.slice(bodyStart, bodyEnd);
const targets = ['3.1 NR01', '3.1.1 一般说明', '3.1.2 具体说明', '3.1.3 校验规则'];

console.log('\n=== Word XML pStyle / outlineLvl ===');
for (const t of targets) {
  const idx = body.indexOf(t);
  if (idx < 0) {
    console.log(t, 'NOT FOUND');
    continue;
  }
  const pStart = body.lastIndexOf('<w:p', idx);
  const snippet = body.slice(pStart, pStart + 800);
  const style = snippet.match(/<w:pStyle[^>]*w:val="([^"]+)"/);
  const outline = snippet.match(/<w:outlineLvl[^>]*w:val="([^"]+)"/);
  console.log(t, { style: style?.[1] ?? null, outlineLvl: outline?.[1] ?? null });
}

await teardownTestDb(tmp);
