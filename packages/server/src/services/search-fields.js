/**
 * 按查询模式限定可搜索的标准字段（仅下列标准 code）
 */
const NORM_SEARCH_FIELDS = ['data_item', 'table_name', 'table_name_main', 'data_element_desc'];
const QA_SEARCH_FIELDS = ['data_item', 'table_name', 'table_name_main', 'question_desc'];

export function getSearchFieldCodes(mode) {
  const resolved = resolveMode(mode);
  if (resolved === 'norm') return [...NORM_SEARCH_FIELDS];
  if (resolved === 'qa') return [...QA_SEARCH_FIELDS];
  return [...new Set([...NORM_SEARCH_FIELDS, ...QA_SEARCH_FIELDS])];
}

function resolveMode(mode) {
  const raw = String(mode ?? 'aggregate').trim().toLowerCase();
  if (raw === 'norm' || raw === '规范') return 'norm';
  if (raw === 'qa' || raw === 'faq' || raw === '答疑') return 'qa';
  return 'aggregate';
}

/** 构建 SQL 匹配条件（payload JSON + std_data_item） */
export function buildSearchMatchSql(mode) {
  const fields = getSearchFieldCodes(mode);
  const parts = ['r.std_data_item LIKE ?'];

  for (const field of fields) {
    if (field === 'data_item') continue;
    parts.push(`IFNULL(json_extract(r.payload, '$.${field}'), '') LIKE ?`);
  }

  return `(${parts.join(' OR ')})`;
}

export function buildSearchMatchParams(keyword, mode) {
  const fields = getSearchFieldCodes(mode);
  const pattern = `%${keyword}%`;
  const params = [pattern];

  for (const field of fields) {
    if (field === 'data_item') continue;
    params.push(pattern);
  }

  return params;
}

export function payloadMatchesKeyword(payload, keyword, mode) {
  const lower = String(keyword ?? '').trim().toLowerCase();
  if (!lower) return false;

  for (const field of getSearchFieldCodes(mode)) {
    const val = payload?.[field];
    if (String(val ?? '').toLowerCase().includes(lower)) {
      return true;
    }
  }
  return false;
}
