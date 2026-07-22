import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readDocumentXmlFromDocx } from '../src/services/docx-file.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docx = path.resolve(__dirname, '../../../参考/文档/1104合并填报说明202601.docx');
const xml = readDocumentXmlFromDocx(fs.readFileSync(docx));

function styleOfParaContaining(snippet) {
  const blocks = xml.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
  for (const block of blocks) {
    const text = block.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!text.includes(snippet)) continue;
    const styleMatch = block.match(/<w:pStyle[^>]*w:val="([^"]+)"/);
    const outlineMatch = block.match(/<w:outlineLvl[^>]*w:val="([^"]+)"/);
    console.log({
      text: text.slice(0, 70),
      style: styleMatch ? styleMatch[1] : '(none)',
      outline: outlineMatch ? outlineMatch[1] : null,
    });
    return;
  }
  console.log({ snippet, found: false });
}

[
  '第一部分：引言',
  '第四部分：核对关系',
  '第一部分：基础数据',
  '第二部分：汇总计算',
  '第三部分：附注项目',
  '[Ⅲ_4.全部债券]',
  '[1．现金]',
  '关于校验公式中表格项目编号',
].forEach(styleOfParaContaining);
