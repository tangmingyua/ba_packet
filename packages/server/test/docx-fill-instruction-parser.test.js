/** Step 0：合并填报说明 Word 解析探针测试 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';
import {
  parseFillInstructionDocumentXml,
  summarizeDocuments,
  collectNodesByKind,
  splitMergedDocuments,
  extractParagraphTexts,
  parseIndicator,
  parseDocCode,
  parseDocumentParagraphs,
  expandIndicators,
  stripRomanIndicatorPrefix,
  isOutlinePartTitle,
  isDetailPartTitle,
} from '../src/services/docx-fill-instruction-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.resolve(__dirname, '../../../参考/文档/1104合并填报说明202601.docx');

function readDocumentXml(docxPath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-docx-test-'));
  try {
    const zipPath = path.join(tempRoot, 'archive.zip');
    const outDir = path.join(tempRoot, 'out');
    fs.copyFileSync(docxPath, zipPath);
    fs.mkdirSync(outDir, { recursive: true });
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'pipe' }
    );
    return fs.readFileSync(path.join(outDir, 'word', 'document.xml'), 'utf8');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

describe('docx-fill-instruction-parser step0', () => {
  it('extractParagraphTexts 忽略修订删除文本，避免 G13+S50 拼成 G13S50', () => {
    const xml =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p>' +
      '<w:del><w:r><w:delText>G13</w:delText></w:r></w:del>' +
      '<w:ins><w:r><w:t>S50</w:t></w:r></w:ins>' +
      '<w:r><w:t>《最大十家关注类贷款情况表》填报说明</w:t></w:r>' +
      '</w:p>' +
      '<w:p><w:r><w:t>第一部分：引言</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const paras = extractParagraphTexts(xml);
    assert.equal(paras[0], 'S50《最大十家关注类贷款情况表》填报说明');
    assert.equal(parseDocCode(paras[0]), 'S50');
    assert.ok(!paras.some((t) => t.includes('G13S50')));
  });

  it('parseDocCode 支持任意字母前缀，保留罗马数字原文', () => {
    assert.equal(parseDocCode('GF01_Ⅱ《资产负债项目统计表附注II》填报说明'), 'GF01_Ⅱ');
    assert.equal(parseDocCode('G01_II《资产负债项目表附注II》填报说明'), 'G01_II');
    assert.equal(parseDocCode('G01《资产负债项目统计表》填报说明'), 'G01');
    assert.equal(parseDocCode('S24《外资银行基础报表附表》填报说明'), 'S24');
    assert.equal(parseDocCode('S23_I《理财公司资产负债表》填报说明'), 'S23_I');
    assert.equal(parseDocCode('S30_I-1《金融控股公司特色财务报表-资产负债表》填报说明'), 'S30_I-1');
    assert.equal(parseDocCode('S21（SF21）《国家开发银行特色报表》填报说明'), 'S21');
    assert.equal(parseDocCode('G25_I 《流动性覆盖率情况表》填报说明'), 'G25_I');
  });

  it('parseIndicator 支持列字母序号如 [B客户名称]、[D关注类…]', () => {
    const d = parseIndicator('[D关注类/次级类/可疑类/损失类贷款余额]');
    assert.equal(d.indicatorKey, 'D');
    assert.equal(d.indicatorNo, null);
    assert.equal(d.indicatorName, '关注类/次级类/可疑类/损失类贷款余额');

    const b = parseIndicator('[B客户名称]');
    assert.equal(b.indicatorKey, 'B');
    assert.equal(b.indicatorName, '客户名称');

    const a = parseIndicator('[A各项存款]：与G01资产负债表口径相同。');
    assert.equal(a.indicatorKey, 'A');
    assert.match(a.inlineBody, /^与G01/);

    // 校验公式不当指标
    assert.equal(parseIndicator('[C]=[A]+[B]').indicatorKey, null);
    assert.equal(parseIndicator('[A]≥[B]').indicatorKey, null);

    // 多列字母拆分
    const multi = expandIndicators('[A、B、Q利率类产品]：说明正文。');
    assert.deepEqual(
      multi.map((x) => x.indicatorKey),
      ['A', 'B', 'Q']
    );
    assert.equal(multi[0].indicatorName, '利率类产品');
    assert.equal(multi[0].inlineBody, '说明正文。');
  });

  it('parseIndicator 支持纯数字、小数序号与字母后缀', () => {
    assert.equal(parseIndicator('[1．现金]').indicatorKey, '1');
    assert.equal(parseIndicator('[1．现金]').indicatorNo, 1);
    assert.equal(parseIndicator('[1．现金]').indicatorName, '现金');

    assert.equal(parseIndicator('[57.1本年利润]').indicatorKey, '57.1');
    assert.equal(parseIndicator('[25a.境外分行资产合计（法人和并表口径下填报）]').indicatorKey, '25a');
    assert.equal(parseIndicator('[12.1a.国债]：').indicatorKey, '12.1a');
    assert.equal(parseIndicator('[2.22A]＝GF01_III_[1.3.1C]').indicatorKey, null);
    assert.equal(parseIndicator('[12.1] ≥[12.1a]+[12.1b]').indicatorKey, null);
  });

  it('parseIndicator 支持同行正文与全角括号', () => {
    const a = parseIndicator(
      '[1．各项贷款]：填报机构对借款人融出货币资金形成的资产。主要包括贷款。'
    );
    assert.equal(a.indicatorKey, '1');
    assert.equal(a.titleText, '[1．各项贷款]');
    assert.match(a.inlineBody, /^填报机构/);

    const b = parseIndicator('［1．各项贷款］：填报机构对借款人融出货币资金形成的资产。');
    assert.equal(b.indicatorKey, '1');
    assert.equal(b.titleText, '［1．各项贷款］');
    assert.match(b.inlineBody, /^填报机构/);

    const tree = parseDocumentParagraphs(
      [
        'G01_II《测试》填报说明',
        '第三部分：具体说明及核对关系',
        '具体说明：',
        '[1．各项贷款]：说明甲。',
        '[1.1.正常贷款]：说明乙。',
      ],
      { docCode: 'G01_II', docTitle: 'G01_II《测试》填报说明' }
    );
    const indicators = collectNodesByKind(tree, 'indicator');
    assert.equal(indicators.length, 2);
    assert.equal(indicators[0].indicatorKey, '1');
    assert.equal(indicators[0].text, '[1．各项贷款]');
    assert.equal(indicators[0].children[0].nodeKind, 'body');
    assert.equal(indicators[0].children[0].text, '说明甲。');
    assert.equal(indicators[1].indicatorKey, '1.1');
  });

  it('多序号指标 [1.1、2.1买入期权] 拆成多个 indicator，正文相同', () => {
    const expanded = expandIndicators(
      '[1.1、2.1买入期权]：是指期权合约的买方在支付期权费后获得权利。'
    );
    assert.equal(expanded.length, 2);
    assert.equal(expanded[0].indicatorKey, '1.1');
    assert.equal(expanded[0].titleText, '[1.1买入期权]');
    assert.equal(expanded[1].indicatorKey, '2.1');
    assert.equal(expanded[1].titleText, '[2.1买入期权]');
    assert.equal(expanded[0].inlineBody, expanded[1].inlineBody);
    assert.match(expanded[0].inlineBody, /^是指期权合约/);

    // 名称中的顿号不应误拆
    const bond = expandIndicators('[12.1c.央行票据、政府机构债券和政策性金融债]：说明');
    assert.equal(bond.length, 1);
    assert.equal(bond[0].indicatorKey, '12.1c');

    const tree = parseDocumentParagraphs(
      [
        'G02《测试》填报说明',
        '第三部分：具体说明',
        '[1.1、2.1买入期权]：共用说明正文。',
        '[1.2、2.2卖出期权]：另一段正文。',
      ],
      { docCode: 'G02', docTitle: 'G02《测试》填报说明' }
    );
    const indicators = collectNodesByKind(tree, 'indicator');
    assert.equal(indicators.length, 4);
    assert.deepEqual(
      indicators.map((n) => n.indicatorKey),
      ['1.1', '2.1', '1.2', '2.2']
    );
    assert.equal(indicators[0].children[0].text, '共用说明正文。');
    assert.equal(indicators[1].children[0].text, '共用说明正文。');
    assert.equal(indicators[2].children[0].text, '另一段正文。');
  });

  it('合并 Word 可拆分为多个字母前缀 document（含 G/S）', () => {
    const xml = readDocumentXml(SAMPLE);
    const paragraphs = extractParagraphTexts(xml);
    const splitDocs = splitMergedDocuments(paragraphs);

    assert.ok(paragraphs.length > 1000);
    assert.ok(splitDocs.length >= 10);
    assert.ok(splitDocs.some((d) => d.docCode === 'G01'));
    assert.ok(splitDocs.some((d) => d.docCode === 'G02'));
    assert.ok(splitDocs.some((d) => d.docCode === 'S24'), '应拆出 S 开头说明');
    assert.ok(splitDocs.some((d) => /^S/.test(d.docCode)));
  });

  it('stripRomanIndicatorPrefix / 罗马前缀指标', () => {
    assert.equal(stripRomanIndicatorPrefix('Ⅲ_4'), '4');
    assert.equal(stripRomanIndicatorPrefix('Ⅱ_1.1'), '1.1');
    assert.equal(stripRomanIndicatorPrefix('4'), '4');

    const roman = parseIndicator('[Ⅲ_4.全部债券]：说明正文。');
    assert.equal(roman.indicatorKey, 'Ⅲ_4');
    assert.equal(roman.indicatorNo, 4);
    assert.equal(roman.indicatorName, '全部债券');
  });

  it('非具体说明 part 为叶子：后续段落并入 text；假大纲不新开 part', () => {
    assert.equal(isDetailPartTitle('第三部分：具体说明'), true);
    assert.equal(isDetailPartTitle('第四部分：核对关系'), false);
    assert.equal(isOutlinePartTitle('第一部分：基础数据'), true);
    assert.equal(isOutlinePartTitle('第一部分：某某。反映本表……'), false);

    const tree = parseDocumentParagraphs(
      [
        'G26《测试》填报说明',
        '第四部分：核对关系',
        '1. 表内核对关系：',
        '第一部分：基础数据',
        'A=B+C',
        '第二部分：汇总计算',
        'D=E',
        '第五部分：案例',
        '案例说明一段。',
      ],
      { docCode: 'G26', docTitle: 'G26《测试》填报说明' }
    );

    const parts = tree.children.filter((c) => c.nodeKind === 'part');
    assert.equal(parts.length, 2, '核对关系 + 案例，假大纲不新开 part');
    assert.match(parts[0].text, /^第四部分：核对关系/);
    assert.match(parts[0].text, /第一部分：基础数据/);
    assert.match(parts[0].text, /A=B\+C/);
    assert.match(parts[0].text, /第二部分：汇总计算/);
    assert.equal(parts[0].children.length, 0, '叶子 part 无子节点');
    assert.equal(parts[1].text.split('\n')[0], '第五部分：案例');
    assert.match(parts[1].text, /案例说明一段/);
  });

  it('G01 树：仅具体说明有子树，其余 part 为叶子', () => {
    const xml = readDocumentXml(SAMPLE);
    const parsed = parseFillInstructionDocumentXml(xml);
    const g01 = parsed.documents.find((d) => d.docCode === 'G01');
    assert.ok(g01);

    const summary = summarizeDocuments([g01])[0];
    assert.ok(summary.byKind.part >= 3);
    assert.equal(summary.byKind.general_item || 0, 0, '不再使用 general_item');
    assert.ok(summary.byKind.section >= 1);
    assert.ok(summary.byKind.indicator >= 10);
    assert.ok(summary.byKind.body >= 10);

    const leafParts = g01.tree.children.filter(
      (c) => c.nodeKind === 'part' && !isDetailPartTitle(c.text.split('\n')[0] || c.text)
    );
    assert.ok(leafParts.length >= 1);
    for (const p of leafParts) {
      assert.equal(p.children.length, 0, `叶子 part 不应有子节点: ${p.text.slice(0, 20)}`);
    }

    const checkPart = leafParts.find((p) => /核对关系/.test(p.text.split('\n')[0] || ''));
    assert.ok(checkPart);
    assert.ok(checkPart.text.includes('\n'), '核对关系正文应并入 part.text');
    assert.match(checkPart.text, /表间|校验|\[4\.\]/);

    const fakeOutlineParts = g01.tree.children.filter((c) => {
      if (c.nodeKind !== 'part') return false;
      const title = (c.text || '').split('\n')[0];
      return /第[一二三四五六七八九十]+部分：\s*(基础数据|汇总计算|附注项目)/.test(title);
    });
    assert.equal(fakeOutlineParts.length, 0, '假大纲不应成为顶层 part');

    const cash = collectNodesByKind(g01.tree, 'indicator').find((n) => n.indicatorNo === 1);
    assert.ok(cash);
    assert.match(cash.text, /现金/);
    assert.ok(cash.children.some((c) => c.nodeKind === 'body' && c.text.includes('库存')));
  });

  it('G01 [25a] 等指标挂在「附注项目」分节下', () => {
    const xml = readDocumentXml(SAMPLE);
    const parsed = parseFillInstructionDocumentXml(xml);
    const g01 = parsed.documents.find((d) => d.docCode === 'G01');
    assert.ok(g01);

    const part3 = g01.tree.children.find(
      (c) => c.nodeKind === 'part' && c.text === '第三部分：具体说明'
    );
    assert.ok(part3);

    const footnote = part3.children.find(
      (c) => c.nodeKind === 'section' && c.text === '附注项目'
    );
    assert.ok(footnote);

    const indicators = collectNodesByKind(footnote, 'indicator');
    const ind25a = indicators.find((n) => n.indicatorKey === '25a');
    assert.ok(ind25a, '25a 应识别为 indicator');
    assert.match(ind25a.text, /境外分行资产合计/);
    assert.ok(
      ind25a.children.some((c) => c.nodeKind === 'body' && c.text.includes('境外分行'))
    );

    assert.ok(
      !part3.children.some(
        (c) => c.nodeKind === 'section' && c.text.includes('25a.境外分行')
      ),
      '25a 不应被误判为与附注项目平级的 section'
    );
  });

  it('「特定项目注解」分节下应包含说明正文', () => {
    const xml = readDocumentXml(SAMPLE);
    const parsed = parseFillInstructionDocumentXml(xml);
    const g01 = parsed.documents.find((d) => d.docCode === 'G01');
    assert.ok(g01);

    const part3 = g01.tree.children.find(
      (c) => c.nodeKind === 'part' && c.text === '第三部分：具体说明'
    );
    const spec = part3.children.find(
      (c) => c.nodeKind === 'section' && c.text === '特定项目注解'
    );
    assert.ok(spec);
    assert.ok(spec.children.length > 0, '特定项目注解下应有正文');
    assert.ok(
      spec.children.some((c) => c.nodeKind === 'body' && c.text.includes('保本类理财产品')),
      '应包含注1相关内容'
    );
  });

  it('合并 Word 按每个大标题拆分，保留 GF01_Ⅱ 罗马字代号', () => {
    const xml = readDocumentXml(SAMPLE);
    const parsed = parseFillInstructionDocumentXml(xml);
    const codes = parsed.documents.map((d) => d.docCode);

    assert.ok(codes.includes('G01'));
    assert.ok(codes.includes('GF01'));
    assert.ok(codes.includes('G01_II'));
    assert.ok(codes.includes('GF01_Ⅱ'), '应保留全角罗马字代号');
    assert.ok(codes.includes('G01_III'));
    assert.ok(codes.length >= 45);

    const gf01ii = parsed.documents.find((d) => d.docCode === 'GF01_Ⅱ');
    assert.ok(gf01ii);
    assert.match(gf01ii.docTitle, /GF01_Ⅱ《/);

    const g01ii = parsed.documents.find((d) => d.docCode === 'G01_II');
    assert.ok(g01ii);
    const parts = collectNodesByKind(g01ii.tree, 'part').map((p) => p.text.split('\n')[0]);
    assert.equal(parts.filter((t) => t === '第一部分：引言').length, 1, 'G01_II 不应再吞入 GF01_Ⅱ');
    assert.ok(!JSON.stringify(g01ii.tree).includes('GF01_Ⅱ《'));
  });

  it('G01_II 具体说明下同行指标应识别为 indicator', () => {
    const xml = readDocumentXml(SAMPLE);
    const parsed = parseFillInstructionDocumentXml(xml);
    const g01ii = parsed.documents.find((d) => d.docCode === 'G01_II');
    assert.ok(g01ii);

    const indicators = collectNodesByKind(g01ii.tree, 'indicator');
    assert.ok(indicators.length >= 5, `期望多个指标，实际 ${indicators.length}`);

    const loan = indicators.find((n) => n.indicatorKey === '1' && /各项贷款/.test(n.text));
    assert.ok(loan);
    assert.equal(loan.text, '[1．各项贷款]');
    assert.ok(
      loan.children.some((c) => c.nodeKind === 'body' && c.text.includes('融出货币资金')),
      '同行正文应挂在指标下'
    );
  });
});
