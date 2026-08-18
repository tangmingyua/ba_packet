import { queryAll } from '../db/database.js';
import { parseIndicatorKeyFromCell } from '../../../web/src/utils/formTemplateIndicator.js';

const TESTIFY_RULE_SUBTYPE = '1104_TESTIFY_RULE';

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** 从校验规则「主指标项」文本解析指标序号（与表样单元格规则对齐） */
export function parseIndicatorKeyFromDataItem(dataItem) {
  const raw = String(dataItem || '').trim();
  if (!raw) return null;

  const withoutCol = raw.replace(/\.([A-Z]{1,3})$/i, '');
  const fromCell = parseIndicatorKeyFromCell(withoutCol);
  if (fromCell) return fromCell;

  const letter = withoutCol.match(/^([A-Za-z])\s*[.．、]/);
  return letter ? letter[1].toUpperCase() : null;
}

export function dataItemMatchesIndicatorKey(dataItem, indicatorKey) {
  const want = String(indicatorKey || '').trim();
  if (!want) return false;
  const got = parseIndicatorKeyFromDataItem(dataItem);
  if (!got) return false;
  return got.toLowerCase() === want.toLowerCase();
}

function mapRuleRow(row) {
  const payload = parsePayload(row.payload);
  return {
    id: row.id,
    tableNo: payload.table_no || '',
    tableName: payload.table_name || '',
    dataItem: payload.data_item || '',
    regRuleContent: payload.reg_rule_content || '',
    testifyRule: payload.testify_rule || '',
    checkCategory: payload.check_category_major || '',
    version: payload.version || row.std_version || '',
  };
}

/**
 * 按填报说明 doc_code（= 校验规则报表号）+ 指标序号查主指标项规则
 */
export function lookupTestifyRulesByDocCode(docCode, indicatorKey, { versionLabel } = {}) {
  const tableNo = String(docCode || '').trim().toUpperCase();
  const key = String(indicatorKey || '').trim();
  if (!tableNo || !key) return { items: [] };

  const rows = queryAll(
    `SELECT dr.id, dr.payload, dr.std_version
     FROM data_records dr
     JOIN subtype_versions sv ON sv.id = dr.subtype_version_id
     WHERE sv.subtype_code = ?
       AND UPPER(json_extract(dr.payload, '$.table_no')) = ?`,
    [TESTIFY_RULE_SUBTYPE, tableNo]
  );

  let matched = rows.filter((row) => {
    const payload = parsePayload(row.payload);
    return dataItemMatchesIndicatorKey(payload.data_item, key);
  });

  const preferredVersion = String(versionLabel ?? '').trim();
  if (preferredVersion && matched.length) {
    const versionMatched = matched.filter((row) => {
      const payload = parsePayload(row.payload);
      const version = String(payload.version || row.std_version || '').trim();
      return version === preferredVersion;
    });
    if (versionMatched.length) matched = versionMatched;
  }

  return { items: matched.map(mapRuleRow) };
}
