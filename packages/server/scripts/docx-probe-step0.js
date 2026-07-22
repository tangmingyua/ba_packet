/**
 * Step 0 探针：解析合并填报说明 docx，输出统计与 G01 样例 JSON
 *
 * 用法：node scripts/docx-probe-step0.js [docx路径]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';
import {
  parseFillInstructionDocumentXml,
  summarizeDocuments,
  collectNodesByKind,
  takeTreePreview,
} from '../src/services/docx-fill-instruction-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDocx = path.resolve(__dirname, '../../../参考/文档/1104合并填报说明202601.docx');

function extractDocumentXml(docxPath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-docx-probe-'));
  const zipPath = path.join(tempRoot, 'archive.zip');
  const outDir = path.join(tempRoot, 'out');

  fs.copyFileSync(docxPath, zipPath);
  fs.mkdirSync(outDir, { recursive: true });

  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'pipe' }
    );
  } else {
    execSync(`unzip -q "${zipPath}" -d "${outDir}"`, { stdio: 'pipe' });
  }

  const xmlPath = path.join(outDir, 'word', 'document.xml');
  if (!fs.existsSync(xmlPath)) {
    throw new Error(`未找到 word/document.xml：${docxPath}`);
  }

  return fs.readFileSync(xmlPath, 'utf8');
}

function main() {
  const docxPath = path.resolve(process.argv[2] || defaultDocx);
  if (!fs.existsSync(docxPath)) {
    console.error(`文件不存在：${docxPath}`);
    process.exit(1);
  }

  const documentXml = extractDocumentXml(docxPath);
  const parsed = parseFillInstructionDocumentXml(documentXml);
  const summary = summarizeDocuments(parsed);
  const g01 = parsed.documents.find((d) => d.docCode === 'G01');

  const report = {
    step: 0,
    sourceFile: path.basename(docxPath),
    sourcePath: docxPath,
    paragraphCount: parsed.paragraphs.length,
    documentCount: parsed.documents.length,
    documents: summary,
    g01: g01
      ? {
          docCode: g01.docCode,
          docTitle: g01.docTitle,
          nodeCount: countTree(g01.tree),
          byKind: summarizeDocuments([g01])[0].byKind,
          treePreview: takeTreePreview(g01.tree, 80),
          indicatorsFirst20: collectNodesByKind(g01.tree, 'indicator')
            .slice(0, 20)
            .map((n) => ({
              indicatorNo: n.indicatorNo,
              text: n.text,
              path: n.path,
              bodyPreview: (n.children[0]?.text || '').slice(0, 80),
            })),
        }
      : null,
  };

  const outDir = path.dirname(docxPath);
  const reportPath = path.join(outDir, 'step0-probe-report.json');
  const g01Path = path.join(outDir, 'step0-g01-sample.json');

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (g01) {
    fs.writeFileSync(
      g01Path,
      `${JSON.stringify(
        {
          docCode: g01.docCode,
          docTitle: g01.docTitle,
          treePreview: report.g01.treePreview,
          indicatorsFirst20: report.g01.indicatorsFirst20,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  }

  console.log('Step 0 探针完成');
  console.log(`源文件：${report.sourceFile}`);
  console.log(`段落数：${report.paragraphCount}`);
  console.log(`拆分 document 数：${report.documentCount}`);
  console.log('各 document 节点统计：');
  for (const item of summary) {
    console.log(
      `  ${item.docCode}  nodes=${item.nodeCount}  indicators=${item.indicatorCount}  ${item.docTitle}`
    );
  }
  if (g01) {
    console.log('\nG01 前 20 个指标项：');
    for (const item of report.g01.indicatorsFirst20) {
      console.log(`  [${item.indicatorNo}] ${item.text}  →  ${item.bodyPreview || '(无正文)'}`);
    }
  }
  console.log(`\n报告已写入：${reportPath}`);
  if (g01) console.log(`G01 样例已写入：${g01Path}`);
}

function countTree(node) {
  return 1 + (node.children || []).reduce((sum, child) => sum + countTree(child), 0);
}

main();
