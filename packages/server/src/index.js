/**
 * API 服务入口
 * 新模型：子类版本配置驱动导入 + data_records 搜索
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { fileURLToPath } from 'url';
import { closeDb, initDb } from './db/database.js';
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
  getDatasetStats,
  searchDatasetRecords,
  suggestDatasetItems,
} from './services/dataset-search.js';
import {
  ensureApiToken,
  getCorsOptions,
  registerLocalApiAuth,
  writeRuntimeSession,
} from './local-api-auth.js';

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
    const { q, limit, mode, categories } = request.query;
    return suggestDatasetItems(q, {
      limit: limit ? Number(limit) : 10,
      mode,
      categories,
    });
  } catch (error) {
    console.error('[api/suggest]', error);
    return reply.code(500).send({ message: error.message || '联想失败', items: [] });
  }
});

app.get('/api/search', async (request, reply) => {
  try {
    const { q, versionId, mode, categories } = request.query;
    return searchDatasetRecords(q, {
      versionId: versionId ? Number(versionId) : undefined,
      mode,
      categories,
    });
  } catch (error) {
    console.error('[api/search]', error);
    return reply.code(500).send({ message: error.message || '搜索失败' });
  }
});

/** 新模型目录 */
app.get('/api/dataset/catalog', async () => getDatasetCatalog());

app.get('/api/dataset/modules', async () => ({ items: listModules() }));

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

/** 1104 表样导入（矩阵结构，剔除逻辑公式） */
app.post('/api/form-template/import', async (request, reply) => {
  let buffer = null;
  let fileName = '';

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        fileName = part.filename || fileName;
      } else if (part.fieldname === 'fileName') {
        fileName = part.value || fileName;
      }
    }
  } catch (error) {
    return reply.code(400).send({ message: error.message || '解析上传内容失败' });
  }

  if (!buffer) {
    return reply.code(400).send({ message: '请上传 Excel 文件' });
  }

  try {
    return importFormTemplate(buffer, { fileName });
  } catch (error) {
    return reply.code(400).send({ message: error.message || '导入失败' });
  }
});

app.get('/api/form-templates', async () => ({ items: listFormTemplates() }));

app.get('/api/form-templates/search', async (request, reply) => {
  try {
    const { q, hitsPerTemplate, maxTemplates } = request.query || {};
    if (!String(q ?? '').trim()) {
      return reply.code(400).send({ message: '请提供搜索关键词 q' });
    }
    return searchFormTemplates(q, {
      maxTemplates: maxTemplates ? Number(maxTemplates) : undefined,
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

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        fileName = part.filename || fileName;
      } else if (part.fieldname === 'fileName') {
        fileName = part.value || fileName;
      }
    }
  } catch (error) {
    return reply.code(400).send({ message: error.message || '解析上传内容失败' });
  }

  if (!buffer) {
    return reply.code(400).send({ message: '请上传 Word 文件' });
  }

  try {
    return importFillInstructionDocument(buffer, { fileName });
  } catch (error) {
    return reply.code(400).send({ message: error.message || '导入失败' });
  }
});

app.get('/api/documents', async () => ({ items: listDocuments() }));

app.get('/api/documents/by-report/:reportCode', async (request, reply) => {
  const item = getDocumentByReport(request.params.reportCode);
  if (!item) return reply.code(404).send({ message: '未找到对应填报说明' });
  return item;
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

/** 兼容旧路径：转发到新搜索统计语义 */
app.get('/api/import/catalog', async () => getDatasetCatalog());

export async function buildApp() {
  await initPlugins();
  await initDb();
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
