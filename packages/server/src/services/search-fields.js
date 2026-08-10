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

/** 空关键词浏览：不限定字段匹配 */
export function buildBrowseWhereSql() {
  return '1 = 1';
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

/** 联想/展示用表名：标准字段「表名」→「表名（主）」 */
export function resolveSuggestTableNameFromPayload(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const tableName = String(p.table_name ?? '').trim();
  if (tableName) return tableName;
  const tableNameMain = String(p.table_name_main ?? '').trim();
  if (tableNameMain) return tableNameMain;
  return '';
}

const SUGGEST_LABEL_MAX = 120;

/** 联想标题：规范以数据项为主；答疑无数据项时用问题描述 */
export function resolveSuggestDataItemLabel(payload, stdDataItem, mode) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const fromStd = String(stdDataItem ?? p.data_item ?? '').trim();
  if (fromStd) return fromStd;
  if (resolveMode(mode) === 'qa') {
    const desc = String(p.question_desc ?? '').trim();
    if (desc) {
      return desc.length > SUGGEST_LABEL_MAX ? `${desc.slice(0, SUGGEST_LABEL_MAX)}…` : desc;
    }
  }
  return '';
}

/**
 * 联想排序：与 SQL 一致，在模式可搜字段上计分（不仅数据项名称）
 */
export function scoreSuggestDatasetMatch(payload, dataItemName, keyword, mode) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const itemName = String(dataItemName ?? p.data_item ?? '').trim();
  let best = 0;
  for (const field of getSearchFieldCodes(mode)) {
    const raw =
      field === 'data_item' ? itemName : String(p[field] ?? '').trim();
    if (!raw) continue;
    const name = raw;
    const kw = String(keyword ?? '').trim();
    if (!kw || !name.includes(kw)) continue;
    let score = 0;
    if (name === kw) score = 1000;
    else if (name.startsWith(kw)) score = 500 + (100 - Math.min(name.length, 100));
    else {
      const index = name.indexOf(kw);
      score = 200 - index + (100 - Math.min(name.length, 100));
    }
    if (score > best) best = score;
  }
  return best;
}
