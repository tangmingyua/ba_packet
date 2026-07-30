/**
 * 前端 API 封装（新模型：dataset / 子类版本 / 配置驱动导入）
 */
function getApiBase() {
  return (typeof window !== 'undefined' && window.__BA_API_BASE__) || '';
}

function getApiToken() {
  return (typeof window !== 'undefined' && window.__BA_API_TOKEN__) || '';
}

function normalizeHeaders(headers) {
  if (!headers) return {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  return { ...headers };
}

function withAuthHeaders(headers = {}) {
  const token = getApiToken();
  const normalized = normalizeHeaders(headers);
  if (!token) return normalized;
  return { ...normalized, Authorization: `Bearer ${token}` };
}

async function request(path, options = {}) {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: withAuthHeaders(options.headers),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `请求失败: ${response.status}`);
  }
  return body;
}

export function getHealth() {
  return request('/api/health');
}

export function suggestItems(q, limit = 10, mode = 'aggregate', { categories, moduleCode, subtypeCode } = {}) {
  const query = new URLSearchParams({ q, limit: String(limit), mode });
  if (categories?.length) query.set('categories', categories.join(','));
  if (moduleCode) query.set('moduleCode', moduleCode);
  if (subtypeCode) {
    const code = Array.isArray(subtypeCode) ? subtypeCode[0] : String(subtypeCode).split(/[,，]/)[0];
    if (code?.trim()) query.set('subtypeCode', code.trim());
  }
  return request(`/api/suggest?${query}`);
}

export function searchRegulatory(q, mode = 'aggregate', { categories, moduleCode, subtypeCode } = {}) {
  const query = new URLSearchParams({ q, mode });
  if (categories?.length) query.set('categories', categories.join(','));
  if (moduleCode) query.set('moduleCode', moduleCode);
  if (subtypeCode) {
    const code = Array.isArray(subtypeCode) ? subtypeCode[0] : String(subtypeCode).split(/[,，]/)[0];
    if (code) query.set('subtypeCode', code.trim());
  }
  return request(`/api/search?${query}`);
}

export function getSearchableCategories(moduleCode) {
  const query = new URLSearchParams();
  if (moduleCode) query.set('moduleCode', moduleCode);
  const qs = query.toString();
  return request(`/api/dataset/search-categories${qs ? `?${qs}` : ''}`);
}

export function getModuleCategoryStats(moduleCode) {
  const query = new URLSearchParams({ moduleCode });
  return request(`/api/dataset/module-category-stats?${query}`);
}

export function getModuleSubtypeStats(moduleCode, categories) {
  const query = new URLSearchParams({ moduleCode });
  if (categories?.length) query.set('categories', categories.join(','));
  return request(`/api/dataset/module-subtype-stats?${query}`);
}

export function browseModuleCategory({ moduleCode, category, keyword, limit, offset } = {}) {
  const query = new URLSearchParams({ moduleCode, category });
  if (keyword) query.set('keyword', keyword);
  if (limit != null) query.set('limit', String(limit));
  if (offset != null) query.set('offset', String(offset));
  return request(`/api/dataset/browse?${query}`);
}

export function getDatasetCatalog() {
  return request('/api/dataset/catalog');
}

export function upsertModule(code, body) {
  return request(`/api/dataset/modules/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function listStandardFields() {
  return request('/api/dataset/standard-fields');
}

export function createStandardField(body) {
  return request('/api/dataset/standard-fields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteStandardField(code) {
  return request(`/api/dataset/standard-fields/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
}

export function updateSubtype(code, body) {
  return request(`/api/dataset/subtypes/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 新建子类（code 不存在时 upsert） */
export function createSubtype(code, body) {
  return updateSubtype(code, body);
}

export function deleteSubtype(code) {
  return request(`/api/dataset/subtypes/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
}

export function createSubtypeVersion(code, body) {
  return request(`/api/dataset/subtypes/${code}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getVersionDetail(id) {
  return request(`/api/dataset/versions/${id}`);
}

export function updateSubtypeVersion(id, body) {
  return request(`/api/dataset/versions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteSubtypeVersion(id) {
  return request(`/api/dataset/versions/${id}`, { method: 'DELETE' });
}

export function clearVersionRecords(id) {
  return request(`/api/dataset/versions/${id}/clear`, { method: 'POST' });
}

export function saveVersionMappings(id, mappings) {
  return request(`/api/dataset/versions/${id}/mappings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mappings }),
  });
}

export function listDatasets() {
  return request('/api/dataset/datasets');
}

export function listVersionRecords(params = {}) {
  const query = new URLSearchParams();
  if (params.subtypeCode) query.set('subtypeCode', params.subtypeCode);
  if (params.versionId) query.set('versionId', String(params.versionId));
  if (params.keyword) query.set('keyword', params.keyword);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.offset != null) query.set('offset', String(params.offset));
  const qs = query.toString();
  return request(`/api/dataset/records${qs ? `?${qs}` : ''}`);
}

export function listCodeValues(moduleCode, dictName) {
  const query = new URLSearchParams({
    module: moduleCode,
    dict_name: dictName,
  });
  return request(`/api/dataset/code-values?${query}`);
}

export function listCodeValueDictNames(moduleCode) {
  const query = new URLSearchParams({ module: moduleCode });
  return request(`/api/dataset/code-values/dict-names?${query}`);
}

export function getCodeValueSummary(moduleCode) {
  const query = new URLSearchParams({ module: moduleCode });
  return request(`/api/dataset/code-values/summary?${query}`);
}

export async function importCodeValuesExcel(file, moduleCode, { subtypeCode, reuse } = {}) {
  const form = new FormData();
  if (file) form.append('file', file);
  form.append('moduleCode', moduleCode);
  if (subtypeCode) form.append('subtypeCode', subtypeCode);
  if (reuse?.length) form.append('reuse', JSON.stringify(reuse));
  const response = await fetch(`${getApiBase()}/api/dataset/code-values/import`, {
    method: 'POST',
    headers: withAuthHeaders(),
    body: form,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || '码值导入失败');
  }
  return response.json();
}

export function saveCodeValueDisplay(moduleCode, dictName, fields) {
  return request('/api/dataset/code-value-display', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleCode, dictName, fields }),
  });
}

export async function importDatasetExcel(file, { versionIds = [], description = '' } = {}) {
  const form = new FormData();
  form.append('file', file);
  form.append('versionIds', JSON.stringify(versionIds));
  if (description) form.append('description', description);
  const response = await fetch(`${getApiBase()}/api/dataset/import`, {
    method: 'POST',
    headers: withAuthHeaders(),
    body: form,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || '导入失败');
  }
  return response.json();
}

export async function importFormTemplateExcel(file, { moduleCode, subtypeCode } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (!moduleCode) {
    throw new Error('请选择模块');
  }
  form.append('moduleCode', moduleCode);
  if (subtypeCode) form.append('subtypeCode', subtypeCode);
  const response = await fetch(`${getApiBase()}/api/form-template/import`, {
    method: 'POST',
    headers: withAuthHeaders(),
    body: form,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || '表样导入失败');
  }
  return response.json();
}

export function listFormTemplates() {
  return request('/api/form-templates');
}

export function getFormTemplate(id) {
  return request(`/api/form-templates/${id}`);
}

export function deleteFormTemplate(id) {
  return request(`/api/form-templates/${id}`, { method: 'DELETE' });
}

export function searchFormTemplateCells(q, { maxTemplates, moduleCode, reportQuery } = {}) {
  const query = new URLSearchParams({ q: String(q) });
  if (maxTemplates != null) query.set('maxTemplates', String(maxTemplates));
  if (moduleCode) query.set('moduleCode', String(moduleCode));
  if (reportQuery) query.set('reportQuery', String(reportQuery));
  return request(`/api/form-templates/search?${query}`);
}

export function getFormTemplateSearchHits(id, q, { hitsLimit } = {}) {
  const query = new URLSearchParams({ q: String(q) });
  if (hitsLimit != null) query.set('hitsLimit', String(hitsLimit));
  return request(`/api/form-templates/${id}/search-hits?${query}`);
}

export async function importFillInstructionDocument(file, { moduleCode, subtypeCode } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (moduleCode) form.append('moduleCode', moduleCode);
  if (subtypeCode) form.append('subtypeCode', subtypeCode);
  const response = await fetch(`${getApiBase()}/api/document/import`, {
    method: 'POST',
    headers: withAuthHeaders(),
    body: form,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || '填报说明导入失败');
  }
  return response.json();
}

export function listDocuments({ moduleCode, subtypeCode } = {}) {
  const query = new URLSearchParams();
  if (moduleCode) query.set('moduleCode', String(moduleCode));
  if (subtypeCode) query.set('subtypeCode', String(subtypeCode));
  const qs = query.toString();
  return request(`/api/documents${qs ? `?${qs}` : ''}`);
}

export function getDocument(id) {
  return request(`/api/documents/${id}`);
}

export function getDocumentByReport(reportCode) {
  return request(`/api/documents/by-report/${encodeURIComponent(reportCode)}`);
}

export function getDocumentIndicator(documentId, indicatorKey) {
  return request(
    `/api/documents/${documentId}/indicators/${encodeURIComponent(indicatorKey)}`
  );
}

export function deleteDocument(id) {
  return request(`/api/documents/${id}`, { method: 'DELETE' });
}

export function updateDocumentReportMapping(id, reportCode) {
  return request(`/api/documents/${id}/report-mapping`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportCode }),
  });
}

export function searchDocumentsApi(q, { maxDocuments, subtypeCode, moduleCode } = {}) {
  const query = new URLSearchParams({ q: String(q ?? '') });
  if (maxDocuments != null) query.set('maxDocuments', String(maxDocuments));
  if (subtypeCode) query.set('subtypeCode', String(subtypeCode));
  if (moduleCode) query.set('moduleCode', String(moduleCode));
  return request(`/api/documents/search?${query}`);
}

export function getDocumentSearchHitsApi(id, q, { hitsLimit } = {}) {
  const query = new URLSearchParams({ q: String(q) });
  if (hitsLimit != null) query.set('hitsLimit', String(hitsLimit));
  return request(`/api/documents/${id}/search-hits?${query}`);
}

export async function importConversionScriptFile(file, { moduleCode, subtypeCode } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (!moduleCode) {
    throw new Error('请选择模块');
  }
  form.append('moduleCode', moduleCode);
  if (subtypeCode) form.append('subtypeCode', subtypeCode);
  const response = await fetch(`${getApiBase()}/api/conversion-script/import`, {
    method: 'POST',
    headers: withAuthHeaders(),
    body: form,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || '脚本导入失败');
  }
  return response.json();
}

export function listConversionScripts({ moduleCode, reportCode } = {}) {
  const query = new URLSearchParams();
  if (moduleCode) query.set('moduleCode', String(moduleCode));
  if (reportCode) query.set('reportCode', String(reportCode));
  const qs = query.toString();
  return request(`/api/conversion-scripts${qs ? `?${qs}` : ''}`);
}

export function getConversionScript(id) {
  return request(`/api/conversion-scripts/${id}`);
}

export function deleteConversionScript(id) {
  return request(`/api/conversion-scripts/${id}`, { method: 'DELETE' });
}

/** @deprecated 兼容旧调用名 */
export function getImportCatalog() {
  return getDatasetCatalog();
}
