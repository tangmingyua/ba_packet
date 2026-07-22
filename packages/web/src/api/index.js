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

export function suggestItems(q, limit = 10, mode = 'aggregate', { categories } = {}) {
  const query = new URLSearchParams({ q, limit: String(limit), mode });
  if (categories?.length) query.set('categories', categories.join(','));
  return request(`/api/suggest?${query}`);
}

export function searchRegulatory(q, mode = 'aggregate', { categories } = {}) {
  const query = new URLSearchParams({ q, mode });
  if (categories?.length) query.set('categories', categories.join(','));
  return request(`/api/search?${query}`);
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

export async function importFormTemplateExcel(file) {
  const form = new FormData();
  form.append('file', file);
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

export function searchFormTemplateCells(q, { maxTemplates } = {}) {
  const query = new URLSearchParams({ q: String(q) });
  if (maxTemplates != null) query.set('maxTemplates', String(maxTemplates));
  return request(`/api/form-templates/search?${query}`);
}

export function getFormTemplateSearchHits(id, q, { hitsLimit } = {}) {
  const query = new URLSearchParams({ q: String(q) });
  if (hitsLimit != null) query.set('hitsLimit', String(hitsLimit));
  return request(`/api/form-templates/${id}/search-hits?${query}`);
}

export async function importFillInstructionDocument(file) {
  const form = new FormData();
  form.append('file', file);
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

export function listDocuments() {
  return request('/api/documents');
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

/** @deprecated 兼容旧调用名 */
export function getImportCatalog() {
  return getDatasetCatalog();
}
