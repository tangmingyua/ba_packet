import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readDocumentXmlFromDocx } from '../src/services/docx-file.js';
import {
  parseFillInstructionDocumentXml,
  collectNodesByKind,
  extractParagraphTexts,
} from '../src/services/docx-fill-instruction-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docx = path.resolve(__dirname, '../../../参考/文档/1104合并填报说明202601.docx');
const buffer = fs.readFileSync(docx);
const xml = readDocumentXmlFromDocx(buffer);
const { documents, paragraphs } = parseFillInstructionDocumentXml(xml);
const g01 = documents.find((d) => d.docCode === 'G01');

function walk(node, ancestors = []) {
  const chain = [...ancestors, `${node.nodeKind}:${node.text.slice(0, 50)}`];
  if (node.text.includes('25a') || node.text.includes('附注项目')) {
    console.log('\n=== NODE ===');
    console.log('kind:', node.nodeKind);
    console.log('text:', node.text);
    console.log('path:', node.path);
    console.log('chain:', chain.join(' > '));
  }
  for (const child of node.children || []) walk(child, chain);
}

console.log('G01 found:', Boolean(g01));
walk(g01.tree);

const sections = [];
function collectSections(node) {
  if (node.nodeKind === 'section') sections.push(node.text);
  for (const child of node.children || []) collectSections(child);
}
collectSections(g01.tree);
console.log('\n=== all sections in G01 ===');
sections.forEach((s, i) => console.log(i + 1, s));

const ind25a = collectNodesByKind(g01.tree, 'indicator').find((n) => /25a/i.test(n.text));
console.log('\n=== indicator 25a ===');
if (ind25a) {
  console.log('text:', ind25a.text);
  console.log('indicatorNo:', ind25a.indicatorNo);
  console.log('path:', ind25a.path);
} else {
  console.log('NOT recognized as indicator');
}

// G01 paragraph window
const g01Start = paragraphs.findIndex((t) => t.includes('G01《'));
const g01paras = [];
for (let i = g01Start; i < paragraphs.length; i++) {
  if (i > g01Start && /^G\d+《/.test(paragraphs[i])) break;
  g01paras.push(paragraphs[i]);
}

console.log('\n=== paragraphs near 附注项目 / 25a ===');
for (let i = 0; i < g01paras.length; i++) {
  if (g01paras[i].includes('附注') || /25a/i.test(g01paras[i])) {
    console.log('--- context ---');
    for (let j = Math.max(0, i - 4); j <= Math.min(g01paras.length - 1, i + 4); j++) {
      const mark = j === i ? '>>>' : '   ';
      console.log(`${mark} [${j}] ${g01paras[j]}`);
    }
  }
}

// Test regex
const sample = '[25a.境外分行资产合计（法人和并表口径下填报）]';
console.log('\n=== regex test ===');
console.log('sample:', sample);
console.log('INDICATOR_RE match:', /^\[(\d+(?:\.\d+)*[a-zA-Z]?)[．.]([^\]=]+)\](?:[：:])?$/.test(sample));
console.log('isSectionTitle would reject indicator - ok');
