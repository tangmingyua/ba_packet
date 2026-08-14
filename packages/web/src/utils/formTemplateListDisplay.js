/** 表样列表：去掉 sheet 名末尾 _231 / _111 等版本后缀（仅前端展示） */
export function stripFormTemplateListSheetSuffix(text) {
  const s = String(text ?? '').trim();
  if (!s) return s;
  return s.replace(/_\d+$/, '');
}

/** 与 1104 相同 sheet 命名规则的主类 */
const STRIP_LIST_SUFFIX_MODULE_CODES = new Set(['1104', 'DJZ']);

function shouldStripFormTemplateListSuffix(item, options = {}) {
  const moduleCode = String(options.moduleCode ?? item?.moduleCode ?? '').trim();
  const subtypeCode = String(options.subtypeCode ?? item?.subtypeCode ?? '').trim();
  if (STRIP_LIST_SUFFIX_MODULE_CODES.has(moduleCode)) return true;
  if (subtypeCode === '1104_FORM_TEMPLATE') return true;
  return subtypeCode.startsWith('DJZ_');
}

/** 表样左侧列表主标题（sheet 名 / 表题 / 表号） */
export function formTemplateListSheetLabel(item, options = {}) {
  const raw =
    item?.sheetName?.trim() || item?.reportTitle?.trim() || item?.reportCode || '';
  if (!raw) return '—';
  if (!shouldStripFormTemplateListSuffix(item, options)) return raw;
  return stripFormTemplateListSheetSuffix(raw);
}

/** 表样预览标题：优先表题，避免 reportCode 与 reportTitle 相同时重复 */
export function formTemplateDisplayTitle(detail) {
  const title = String(detail?.reportTitle ?? '').trim();
  const code = String(detail?.reportCode ?? '').trim();
  if (title) return title;
  return code || '—';
}

/** @deprecated 使用 stripFormTemplateListSheetSuffix */
export const strip1104FormTemplateListSuffix = stripFormTemplateListSheetSuffix;
