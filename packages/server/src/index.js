/**
 * API 服务入口
 * 新模型：子类版本配置驱动导入 + data_records 搜索
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { fileURLToPath } from 'url';
import { closeDb, initDb, queryAll } from './db/database.js';
import {
  clearVersionRecords,
  createStandardField,
  createSubtypeVersion,
  deleteStandardField,
  deleteSubtype,
  deleteSubtypeVersion,
  getDatasetCatalog,
  getVersionDetail,
  listDatasets,
  listSearchableCategories,
  listStandardFields,
  listSubtypes,
  listSubtypeVersions,
  listVersionRecordsView,
  listModules,
  saveFieldMappings,
  updateSubtype,
  updateSubtypeVersion,
  upsertModule,
  upsertSubtype,
} from './services/dataset-config.js';
import { importDatasetExcel } from './services/dataset-import.js';
import { browseModuleCategory, getModuleCategoryStats, getModuleSubtypeStats } from './services/module-browse.js';
import {
  getModuleCodeValueSummary,
  importModuleCodeValues,
  listCodeValueDisplay,
  listModuleCodeValueDictNames,
  listModuleCodeValues,
  saveCodeValueDisplay,
} from './services/code-value.js';
import {
  deleteFormTemplate,
  getFormTemplate,
  importFormTemplate,
  listFormTemplates,
} from './services/form-template-import.js';
import { searchFormTemplates, getFormTemplateSearchHits } from './services/form-template-search.js';
import {
  deleteDocument,
  getDocument,
  getDocumentByReport,
  getDocumentIndicator,
  importFillInstructionDocument,
  updateDocumentReportMapping,
  listDocuments,
} from './services/document-import.js';
import {
  deleteConversionScript,
  getConversionScript,
  importConversionScript,
  listConversionScripts,
} from './services/conversion-script-import.js';
import { searchDocuments, getDocumentSearchHits } from './services/document-search.js';
import {
  getDatasetStats,
} from './services/dataset-search.js';
import { unifiedSearch, unifiedSuggest } from './services/unified-search.js';
import {
  ensureApiToken,
  getCorsOptions,
  registerLocalApiAuth,
  writeRuntimeSession,
} from './local-api-auth.js';
import { registerDesktopWebUi } from './desktop-web-ui.js';

const PORT = Number(process.env.BA_PORT || 39281);
const HOST = process.env.BA_HOST || '127.0.0.1';

ensureApiToken();

const app = Fastify({ logger: false });

let pluginsReady = false;

async function initPlugins() {
  if (pluginsReady) return;
  await app.register(cors, getCorsOptions());
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });
  registerLocalApiAuth(app);
  pluginsReady = true;
}

app.get('/api/health', async () => ({ ok: true, ...getDatasetStats() }));

app.get('/api/suggest', async (request, reply) => {
  try {
    const { q, limit, mode, categories, moduleCode, moduleCodes, subtypeCode } = request.query;
    return unifiedSuggest(q, {
      limit: limit ? Number(limit) : 10,
      mode,
      categories,
      moduleCode,
      moduleCodes,
      subtypeCode,
    });
  } catch (error) {
    console.error('[api/suggest]', error);
    return reply.code(500).send({ message: error.message || '联想失败', items: [] });
  }
});

app.get('/api/search', async (request, reply) => {
  try {
    const { q, versionId, mode, categories, moduleCode, subtypeCode } = request.query;
    return unifiedSearch(q, {
      versionId: versionId ? Number(versionId) : undefined,
      mode,
      categories,
      moduleCode,
      subtypeCode,
    });
  } catch (error) {
    console.error('[api/search]', error);
    return reply.code(500).send({ message: error.message || '搜索失败' });
  }
});

/** 新模型目录 */
app.get('/api/dataset/catalog', async () => getDatasetCatalog());

app.get('/api/dataset/search-categories', async (request) => {
  const { moduleCode } = request.query || {};
  return { items: listSearchableCategories({ moduleCode }) };
});

app.get('/api/dataset/module-category-stats', async (request, reply) => {
  try {
    const { moduleCode } = request.query || {};
    return { items: getModuleCategoryStats(moduleCode) };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '统计失败' });
  }
});

app.get('/api/dataset/module-subtype-stats', async (request, reply) => {
  try {
    const { moduleCode, categories } = request.query || {};
    return { items: getModuleSubtypeStats(moduleCode, categories) };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '统计失败' });
  }
});

app.get('/api/dataset/browse', async (request, reply) => {
  try {
    const { moduleCode, category, keyword, limit, offset } = request.query || {};
    return browseModuleCategory({
      moduleCode,
      category,
      keyword,
      limit,
      offset,
    });
  } catch (error) {
    return reply.code(400).send({ message: error.message || '浏览失败' });
  }
});

app.get('/api/dataset/modules', async () => ({ items: listModules() }));

/** 模块码值：查询 / 导入 / 展示映射 */
app.get('/api/dataset/code-values', async (request, reply) => {
  try {
    const { module: moduleCode, dict_name: dictName } = request.query || {};
    if (!moduleCode || !dictName) {
      return reply.code(400).send({ message: '请提供 module 与 dict_name 参数' });
    }
    return listModuleCodeValues(moduleCode, dictName);
  } catch (error) {
    return reply.code(400).send({ message: error.message || '查询失败' });
  }
});

app.get('/api/dataset/code-values/dict-names', async (request, reply) => {
  try {
    const { module: moduleCode } = request.query || {};
    if (!moduleCode) {
      return reply.code(400).send({ message: '请提供 module 参数' });
    }
    return { items: listModuleCodeValueDictNames(moduleCode) };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '查询失败' });
  }
});

app.get('/api/dataset/code-values/summary', async (request, reply) => {
  try {
    const { module: moduleCode } = request.query || {};
    if (!moduleCode) {
      return reply.code(400).send({ message: '请提供 module 参数' });
    }
    return getModuleCodeValueSummary(moduleCode);
  } catch (error) {
    return reply.code(400).send({ message: error.message || '查询失败' });
  }
});

app.post('/api/dataset/code-values/import', async (request, reply) => {
  let buffer = null;
  const fields = {};
  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        if (!fields.fileName) fields.fileName = part.filename;
      } else if (part.fieldname) {
        fields[part.fieldname] = part.value;
      }
    }
  } catch (error) {
    return reply.code(400).send({ message: error.message || '解析上传内容失败' });
  }
  if (!buffer && !fields.reuse) {
    return reply.code(400).send({ message: '请上传 Excel 文件或选择要复用的码表' });
  }
  let reuse = [];
  if (fields.reuse) {
    try {
      const parsed = JSON.parse(fields.reuse);
      reuse = Array.isArray(parsed) ? parsed : [];
    } catch {
      return reply.code(400).send({ message: 'reuse 参数须为 JSON 数组' });
    }
  }
  if (!buffer && !reuse.length) {
    return reply.code(400).send({ message: '请上传 Excel 文件或选择要复用的码表' });
  }
  try {
    return importModuleCodeValues(buffer, {
      moduleCode: fields.moduleCode,
      fileName: fields.fileName || fields.uploadFileName,
      subtypeCode: fields.subtypeCode || undefined,
      reuse,
    });
  } catch (error) {
    return reply.code(400).send({ message: error.message || '导入失败' });
  }
});

app.put('/api/dataset/code-value-display', async (request, reply) => {
  try {
    const { moduleCode, dictName, fields } = request.body || {};
    return saveCodeValueDisplay(moduleCode, dictName, fields || []);
  } catch (error) {
    return reply.code(400).send({ message: error.message || '保存失败' });
  }
});

app.put('/api/dataset/modules/:code', async (request, reply) => {
  try {
    const module = upsertModule({ code: request.params.code, ...(request.body || {}) });
    return { module };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '保存失败' });
  }
});

app.get('/api/dataset/standard-fields', async () => ({ items: listStandardFields() }));

app.post('/api/dataset/standard-fields', async (request, reply) => {
  try {
    const field = createStandardField(request.body || {});
    return { field };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '创建失败' });
  }
});

app.delete('/api/dataset/standard-fields/:code', async (request, reply) => {
  try {
    const result = deleteStandardField(request.params.code);
    return result;
  } catch (error) {
    return reply.code(400).send({ message: error.message || '删除失败' });
  }
});

app.get('/api/dataset/subtypes', async () => ({ items: listSubtypes() }));

app.put('/api/dataset/subtypes/:code', async (request, reply) => {
  try {
    const body = request.body || {};
    const existing = listSubtypes().find((s) => s.code === request.params.code);
    const subtype = existing
      ? updateSubtype(request.params.code, body)
      : upsertSubtype({ code: request.params.code, ...body });
    return { subtype };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '保存失败' });
  }
});

app.delete('/api/dataset/subtypes/:code', async (request, reply) => {
  try {
    const result = deleteSubtype(request.params.code);
    return result;
  } catch (error) {
    return reply.code(400).send({ message: error.message || '删除失败' });
  }
});

app.get('/api/dataset/subtypes/:code/versions', async (request) => ({
  items: listSubtypeVersions(request.params.code),
}));

app.post('/api/dataset/subtypes/:code/versions', async (request, reply) => {
  try {
    const version = createSubtypeVersion(request.params.code, request.body || {});
    return { version };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '创建失败' });
  }
});

app.get('/api/dataset/versions/:id', async (request, reply) => {
  const detail = getVersionDetail(Number(request.params.id));
  if (!detail) return reply.code(404).send({ message: '版本不存在' });
  return detail;
});

app.put('/api/dataset/versions/:id', async (request, reply) => {
  try {
    const version = updateSubtypeVersion(Number(request.params.id), request.body || {});
    return { version };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '保存失败' });
  }
});

app.delete('/api/dataset/versions/:id', async (request, reply) => {
  try {
    deleteSubtypeVersion(Number(request.params.id));
    return { ok: true };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '删除失败' });
  }
});

app.post('/api/dataset/versions/:id/clear', async (request, reply) => {
  try {
    const result = clearVersionRecords(Number(request.params.id));
    return result;
  } catch (error) {
    return reply.code(400).send({ message: error.message || '清空失败' });
  }
});

app.put('/api/dataset/versions/:id/mappings', async (request, reply) => {
  try {
    const mappings = saveFieldMappings(
      Number(request.params.id),
      request.body?.mappings || []
    );
    return { mappings };
  } catch (error) {
    return reply.code(400).send({ message: error.message || '保存失败' });
  }
});

app.get('/api/dataset/datasets', async () => ({ items: listDatasets() }));

app.get('/api/dataset/records', async (request) => {
  const { subtypeCode, versionId, keyword, limit, offset } = request.query || {};
  return listVersionRecordsView({
    subtypeCode,
    versionId: versionId ? Number(versionId) : undefined,
    keyword,
    limit,
    offset,
  });
});

/** 配置驱动 Excel 导入 */
app.post('/api/dataset/import', async (request, reply) => {
  let buffer = null;
  const fields = {};

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        if (!fields.fileName) fields.fileName = part.filename;
      } else if (part.fieldname) {
        fields[part.fieldname] = part.value;
      }
    }
  } catch (error) {
    return reply.code(400).send({ message: error.message || '解析上传内容失败' });
  }

  if (!buffer) {
    return reply.code(400).send({ message: '请上传 Excel 文件' });
  }

  try {
    const result = importDatasetExcel(buffer, {
      fileName: fields.fileName || fields.uploadFileName,
      versionIds: fields.versionIds,
      description: fields.description,
    });
    return result;
  } catch (error) {
    return reply.code(400).send({ message: error.message || '导入失败' });
  }
});

/** 表样导入（矩阵结构，剔除逻辑公式；须选择模块） */
app.post('/api/form-template/import', async (request, reply) => {
  let buffer = null;
  let fileName = '';
  let moduleCode = '';
  let subtypeCode = '';
  let versionLabel = '';

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        fileName = part.filename || fileName;
      } else if (part.fieldname === 'fileName') {
        fileName = part.value || fileName;
      } else if (part.fieldname === 'moduleCode') {
        moduleCode = part.value || moduleCode;
      } else if (part.fieldname === 'subtypeCode') {
        subtypeCode = part.value || subtypeCode;
      } else if (part.fieldname === 'versionLabel') {
        versionLabel = part.value || versionLabel;
      }
    }
  } catch (error) {
    return reply.code(400).send({ message: error.message || '解析上传内容失败' });
  }

  if (!buffer) {
    return reply.code(400).send({ message: '请上传 Excel 文件' });
  }

  if (!String(moduleCode || '').trim()) {
    return reply.code(400).send({ message: '请选择模块' });
  }

  try {
    return await importFormTemplate(buffer, {
      fileName,
      moduleCode,
      subtypeCode: subtypeCode || undefined,
      versionLabel: versionLabel || undefined,
    });
  } catch (error) {
    return reply.code(400).send({ message: error.message || '导入失败' });
  }
});

app.get('/api/form-templates', async (request) => {
  const { moduleCode, subtypeCode } = request.query || {};
  return {
    items: listFormTemplates({
      moduleCode: moduleCode ? String(moduleCode) : undefined,
      subtypeCode: subtypeCode ? String(subtypeCode) : undefined,
    }),
  };
});

app.get('/api/form-templates/search', async (request, reply) => {
  try {
    const { q, hitsPerTemplate, maxTemplates, moduleCode, reportQuery, subtypeCode } = request.query || {};
    if (!String(q ?? '').trim()) {
      return reply.code(400).send({ message: '请提供搜索关键词 q' });
    }
    return searchFormTemplates(q, {
      maxTemplates: maxTemplates ? Number(maxTemplates) : undefined,
      moduleCode: moduleCode ? String(moduleCode) : undefined,
      subtypeCode: subtypeCode ? String(subtypeCode) : undefined,
      reportQuery: reportQuery ? String(reportQuery) : undefined,
    });
  } catch (error) {
    return reply.code(500).send({ message: error.message || '搜索失败' });
  }
});

app.get('/api/form-templates/:id/search-hits', async (request, reply) => {
  try {
    const { q, hitsLimit } = request.query || {};
    if (!String(q ?? '').trim()) {
      return reply.code(400).send({ message: '请提供搜索关键词 q' });
    }
    const item = getFormTemplate(Number(request.params.id));
    if (!item) return reply.code(404).send({ message: '表样不存在' });
    return getFormTemplateSearchHits(Number(request.params.id), q, {
      hitsLimit: hitsLimit ? Number(hitsLimit) : undefined,
    });
  } catch (error) {
    return reply.code(500).send({ message: error.message || '搜索失败' });
  }
});

app.delete('/api/form-templates/:id', async (request, reply) => {
  try {
    return deleteFormTemplate(Number(request.params.id));
  } catch (error) {
    const msg = error.message || '删除失败';
    if (msg.includes('不存在') || msg.includes('无效')) {
      return reply.code(404).send({ message: msg });
    }
    return reply.code(400).send({ message: msg });
  }
});

app.get('/api/form-templates/:id', async (request, reply) => {
  const item = getFormTemplate(Number(request.params.id));
  if (!item) return reply.code(404).send({ message: '表样不存在' });
  return item;
});

/** 1104 合并填报说明 Word */
app.post('/api/document/import', async (request, reply) => {
  let buffer = null;
  let fileName = '';
  let profileId = '';
  let moduleCode = '';
  let subtypeCode = '';
  let versionLabel = '';

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        fileName = part.filename || fileName;
      } else if (part.fieldname === 'fileName') {
        fileName = part.value || fileName;
      } else if (part.fieldname === 'profileId') {
        profileId = part.value || profileId;
      } else if (part.fieldname === 'moduleCode') {
        moduleCode = part.value || moduleCode;
      } else if (part.fieldname === 'subtypeCode') {
        subtypeCode = part.value || subtypeCode;
      } else if (part.fieldname === 'versionLabel') {
        versionLabel = part.value || versionLabel;
      }
    }
  } catch (error) {
    return reply.code(400).send({ message: error.message || '解析上传内容失败' });
  }

  if (!buffer) {
    return reply.code(400).send({ message: '请上传 Word 文件' });
  }

  try {
    return importFillInstructionDocument(buffer, {
      fileName,
      profileId: profileId || undefined,
      moduleCode: moduleCode || undefined,
      subtypeCode: subtypeCode || undefined,
      versionLabel: versionLabel || undefined,
    });
  } catch (error) {
    return reply.code(400).send({ message: error.message || '导入失败' });
  }
});

app.get('/api/documents', async (request) => {
  const { moduleCode, subtypeCode } = request.query || {};
  return {
    items: listDocuments({
      moduleCode: moduleCode ? String(moduleCode) : undefined,
      subtypeCode: subtypeCode ? String(subtypeCode) : undefined,
    }),
  };
});

app.get('/api/documents/search', async (request, reply) => {
  try {
    const { q, maxDocuments, subtypeCode, moduleCode } = request.query || {};
    const result = searchDocuments(String(q ?? '').trim(), {
      maxDocuments: maxDocuments ? Number(maxDocuments) : undefined,
      subtypeCode: subtypeCode ? String(subtypeCode) : undefined,
    });
    const mod = String(moduleCode ?? '').trim();
    if (mod && result.items?.length) {
      const allowed = new Set(
        queryAll(`SELECT id FROM documents WHERE module_code = ?`, [mod]).map((r) =>
          Number(r.id)
        )
      );
      result.items = result.items.filter((doc) => allowed.has(doc.id));
      result.totalDocuments = result.items.length;
      result.totalHits = result.items.reduce((sum, item) => sum + (item.hitCount || 0), 0);
    }
    return result;
  } catch (error) {
    return reply.code(500).send({ message: error.message || '搜索失败' });
  }
});

app.get('/api/documents/by-report/:reportCode', async (request, reply) => {
  const versionLabel = request.query?.versionLabel;
  const item = getDocumentByReport(request.params.reportCode, {
    versionLabel: versionLabel != null ? String(versionLabel) : undefined,
  });
  if (!item) return reply.code(404).send({ message: '未找到对应填报说明' });
  return item;
});

app.get('/api/documents/:id/search-hits', async (request, reply) => {
  try {
    const { q, hitsLimit } = request.query || {};
    if (!String(q ?? '').trim()) {
      return reply.code(400).send({ message: '请提供搜索关键词 q' });
    }
    const item = getDocument(Number(request.params.id));
    if (!item) return reply.code(404).send({ message: '填报说明不存在' });
    return getDocumentSearchHits(Number(request.params.id), q, {
      hitsLimit: hitsLimit ? Number(hitsLimit) : undefined,
    });
  } catch (error) {
    return reply.code(500).send({ message: error.message || '搜索失败' });
  }
});

app.get('/api/documents/:id', async (request, reply) => {
  const item = getDocument(Number(request.params.id));
  if (!item) return reply.code(404).send({ message: '填报说明不存在' });
  return item;
});

app.get('/api/documents/:id/indicators/:key', async (request, reply) => {
  const key = decodeURIComponent(request.params.key || '');
  const result = getDocumentIndicator(Number(request.params.id), key);
  if (!result) return reply.code(404).send({ message: '填报说明不存在' });
  if (!result.found) return reply.code(404).send({ message: `未找到指标 ${key}`, ...result });
  return result;
});

app.put('/api/documents/:id/report-mapping', async (request, reply) => {
  try {
    const reportCode = request.body?.reportCode ?? '';
    return updateDocumentReportMapping(Number(request.params.id), reportCode);
  } catch (error) {
    const msg = error.message || '保存失败';
    if (msg.includes('不存在')) return reply.code(404).send({ message: msg });
    return reply.code(400).send({ message: msg });
  }
});

app.delete('/api/documents/:id', async (request, reply) => {
  try {
    return deleteDocument(Number(request.params.id));
  } catch (error) {
    const msg = error.message || '删除失败';
    if (msg.includes('不存在')) return reply.code(404).send({ message: msg });
    return reply.code(400).send({ message: msg });
  }
});

/** 转1104 脚本（SQL/TXT） */
app.post('/api/conversion-script/import', async (request, reply) => {
  let buffer = null;
  let fileName = '';
  let moduleCode = '';
  let subtypeCode = '';

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        fileName = part.filename || fileName;
      } else if (part.fieldname === 'fileName') {
        fileName = part.value || fileName;
      } else if (part.fieldname === 'moduleCode') {
        moduleCode = part.value || moduleCode;
      } else if (part.fieldname === 'subtypeCode') {
        subtypeCode = part.value || subtypeCode;
      }
    }
  } catch (error) {
    return reply.code(400).send({ message: error.message || '解析上传内容失败' });
  }

  if (!buffer) {
    return reply.code(400).send({ message: '请上传脚本文件' });
  }

  if (!String(moduleCode || '').trim()) {
    return reply.code(400).send({ message: '请选择模块' });
  }

  try {
    return importConversionScript(buffer, { fileName, moduleCode, subtypeCode: subtypeCode || undefined });
  } catch (error) {
    return reply.code(400).send({ message: error.message || '导入失败' });
  }
});

app.get('/api/conversion-scripts', async (request) => {
  const { moduleCode, reportCode, subtypeCode } = request.query || {};
  return {
    items: listConversionScripts({
      moduleCode: moduleCode ? String(moduleCode) : undefined,
      reportCode: reportCode ? String(reportCode) : undefined,
      subtypeCode: subtypeCode ? String(subtypeCode) : undefined,
    }),
  };
});

app.get('/api/conversion-scripts/:id', async (request, reply) => {
  const item = getConversionScript(Number(request.params.id));
  if (!item) return reply.code(404).send({ message: '脚本不存在' });
  return item;
});

app.delete('/api/conversion-scripts/:id', async (request, reply) => {
  try {
    return deleteConversionScript(Number(request.params.id));
  } catch (error) {
    const msg = error.message || '删除失败';
    if (msg.includes('不存在')) return reply.code(404).send({ message: msg });
    return reply.code(400).send({ message: msg });
  }
});

/** 兼容旧路径：转发到新搜索统计语义 */
app.get('/api/import/catalog', async () => getDatasetCatalog());

export async function buildApp() {
  await initPlugins();
  await initDb();
  await registerDesktopWebUi(app);
  return app;
}

const start = async () => {
  try {
    await buildApp();
    await app.listen({ port: PORT, host: HOST });
    writeRuntimeSession({ host: HOST, port: PORT });
    console.log(`API 服务已启动: http://${HOST}:${PORT}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const shutdown = async () => {
  await app.close();
  closeDb();
  process.exit(0);
};

function shouldAutoStart() {
  if (process.env.BA_SKIP_AUTO_START === '1') return false;
  if (process.pkg || process.sea) return true;
  try {
    if (process.argv[1] === fileURLToPath(import.meta.url)) return true;
  } catch {
    // bundled cjs may not expose import.meta
  }
  return typeof require !== 'undefined' && require.main === module;
}

if (shouldAutoStart()) {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  start();
}

export { app, PORT, HOST };
export { getApiToken } from './local-api-auth.js';
