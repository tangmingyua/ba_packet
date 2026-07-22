/** 1104 表样单元格搜索测试 */

import { describe, it, before, after } from 'node:test';

import assert from 'node:assert/strict';

import fs from 'fs';

import path from 'path';

import { fileURLToPath } from 'url';

import { setupTestDb, teardownTestDb } from './helpers/fixture.js';

import { buildApp, getApiToken } from '../src/index.js';

import { importFormTemplate, listFormTemplates } from '../src/services/form-template-import.js';

import { countCellsForTemplate } from '../src/services/form-template-cells.js';

import {

  searchFormTemplates,

  getFormTemplateSearchHits,

} from '../src/services/form-template-search.js';



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE = path.resolve(__dirname, '../../../参考/汇总指标案例/G0100-logic_231.xls');



function authHeaders(extra = {}) {

  return { authorization: `Bearer ${getApiToken()}`, ...extra };

}



describe('form-template-search', () => {

  let tmpDir;

  let app;

  let g0100Id;



  before(async () => {

    tmpDir = await setupTestDb();

    const imported = importFormTemplate(fs.readFileSync(SAMPLE), { fileName: 'G0100-logic_231.xls' });

    g0100Id = imported.id;

    app = await buildApp();

    await app.ready();

  });



  after(async () => {

    await app.close();

    await teardownTestDb(tmpDir);

  });



  it('导入后写入 form_template_cells', () => {

    assert.ok(countCellsForTemplate(g0100Id) > 0);

  });



  it('searchFormTemplates 阶段1 返回表样与 hitCount', () => {

    const result = searchFormTemplates('现金');

    assert.ok(result.totalTemplates >= 1);

    assert.ok(result.totalHits >= 1);

    const g0100 = result.items.find((x) => x.reportCode === 'G0100');

    assert.ok(g0100);

    assert.ok(g0100.hitCount >= 1);

    assert.equal(g0100.hits, undefined);

  });



  it('getFormTemplateSearchHits 阶段2 返回坐标', () => {

    const hits = getFormTemplateSearchHits(g0100Id, '现金');

    assert.ok(hits.hitCount >= 1);

    assert.ok(hits.hits.some((h) => h.text.includes('现金')));

    assert.ok(hits.hits[0].snippet);

  });



  it('searchFormTemplates 可按表样名称命中', () => {
    const result = searchFormTemplates('资产负债项目统计表');
    assert.ok(result.totalTemplates >= 1);
    assert.ok(result.items.some((x) => x.reportCode === 'G0100'));
  });

  it('getFormTemplateSearchHits 表样名称命中返回 meta 项', () => {
    const hits = getFormTemplateSearchHits(g0100Id, '资产负债项目统计表');
    assert.ok(hits.hitCount >= 1);
    assert.ok(hits.hits.some((h) => h.cellKind === 'template_title'));
  });

  it('searchFormTemplates 无命中', () => {

    const result = searchFormTemplates('不存在的关键词xyz');

    assert.equal(result.totalTemplates, 0);

    assert.equal(result.totalHits, 0);

  });



  it('搜索表头列维度', () => {

    const result = searchFormTemplates('外币折人民币');

    assert.ok(result.totalHits >= 1);

    const g0100 = result.items[0];

    const hits = getFormTemplateSearchHits(g0100.id, '外币折人民币');

    assert.ok(hits.hits.some((h) => h.row < 6));

  });



  it('搜索分表标题', () => {

    const buffer = fs.readFileSync(

      path.resolve(__dirname, '../../../参考/汇总指标案例/G0200-logic_241.xls')

    );

    importFormTemplate(buffer, { fileName: 'G0200-logic_241.xls' });

    const result = searchFormTemplates('表一');

    assert.ok(result.totalHits >= 1);

    assert.ok(result.items.some((x) => x.reportCode === 'G0200'));

  });



  it('搜索命中子项列', () => {
    const g0200 = listFormTemplates().find((x) => x.reportCode === 'G0200');
    assert.ok(g0200, '需先导入 G0200');

    const result = searchFormTemplates('买入期权');
    assert.ok(result.totalHits >= 1);
    assert.ok(result.items.some((x) => x.reportCode === 'G0200'));

    const hits = getFormTemplateSearchHits(g0200.id, '买入期权');
    assert.ok(hits.hitCount >= 1);
  });



  it('GET /api/form-templates/search 阶段1', async () => {

    const res = await app.inject({

      method: 'GET',

      url: '/api/form-templates/search?q=贵金属',

      headers: authHeaders(),

    });

    assert.equal(res.statusCode, 200);

    const body = res.json();

    assert.ok(body.totalHits >= 1);

    assert.ok(body.items[0].hitCount >= 1);

    assert.equal(body.items[0].hits, undefined);

  });



  it('GET /api/form-templates/:id/search-hits 阶段2', async () => {

    const res = await app.inject({

      method: 'GET',

      url: `/api/form-templates/${g0100Id}/search-hits?q=贵金属`,

      headers: authHeaders(),

    });

    assert.equal(res.statusCode, 200);

    const body = res.json();

    assert.ok(body.hitCount >= 1);

    assert.ok(body.hits[0].snippet);

  });



  it('GET /api/form-templates/search 缺关键词', async () => {

    const res = await app.inject({

      method: 'GET',

      url: '/api/form-templates/search',

      headers: authHeaders(),

    });

    assert.equal(res.statusCode, 400);

  });

});

