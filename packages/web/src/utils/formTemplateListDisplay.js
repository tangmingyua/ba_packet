/** 1104 表样列表：去掉 sheet 名末尾 _231 等后缀（仅前端展示） */
export function strip1104FormTemplateListSuffix(text) {
  const s = String(text ?? '').trim();
  if (!s) return s;
  return s.replace(/_\d+$/, '');
}

function is1104FormTemplateContext(item, options = {}) {
  const moduleCode = String(options.moduleCode ?? item?.moduleCode ?? '').trim();
  const subtypeCode = String(options.subtypeCode ?? item?.subtypeCode ?? '').trim();
  return moduleCode === '1104' || subtypeCode === '1104_FORM_TEMPLATE';
}

/** 表样左侧列表主标题（sheet 名 / 表题 / 表号） */
export function formTemplateListSheetLabel(item, options = {}) {
  const raw =
    item?.sheetName?.trim() || item?.reportTitle?.trim() || item?.reportCode || '';
  if (!raw) return '—';
  if (!is1104FormTemplateContext(item, options)) return raw;
  return strip1104FormTemplateListSuffix(raw);
}
