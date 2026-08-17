/**
 * 查询页隐藏的子类：导入页仍可见，不出现在 TAB / 标签统计 / 统一检索。
 * 「表样目录」供 1104 / 大集中表样入口内部使用。
 */
export const QUERY_HIDDEN_SUBTYPE_NAMES = new Set(['表样目录']);

/** 点「表样」时先出目录的主类 */
export const FORM_TEMPLATE_CATALOG_ENTRY_MODULES = new Set(['1104', 'DJZ']);

export const FORM_TEMPLATE_CATALOG_SUBTYPE_NAME = '表样目录';

export function isQueryHiddenSubtype(st) {
  return QUERY_HIDDEN_SUBTYPE_NAMES.has(String(st?.name ?? '').trim());
}

export function queryHiddenSubtypeNameList() {
  return [...QUERY_HIDDEN_SUBTYPE_NAMES];
}

/** SQL：排除查询页隐藏子类（默认表别名 s） */
export function sqlExcludeHiddenSubtypeNames(alias = 's') {
  const names = queryHiddenSubtypeNameList();
  if (!names.length) return { clause: '', params: [] };
  const placeholders = names.map(() => '?').join(',');
  return {
    clause: ` AND ${alias}.name NOT IN (${placeholders})`,
    params: names,
  };
}
