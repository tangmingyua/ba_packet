/** 资料导入：旧 Tab 名 → 系统子类 code（兼容外链） */
export const LEGACY_IMPORT_TAB_TO_SUBTYPE = {
  formTemplate: '1104_FORM_TEMPLATE',
  fillInstruction: '1104_FILL_INSTRUCTION',
  conversionScript: 'CONVERSION_SCRIPT',
  codeValues: 'YBT_CODE_VALUE',
};

export const IMPORT_TABS = ['import', 'subtypes', 'fields', 'data'];

export function resolveImportTabFromRoute(query = {}) {
  const tab = String(query.tab || 'import');
  if (IMPORT_TABS.includes(tab)) {
    return { tab, subtype: String(query.subtype || '') };
  }
  const subtype = LEGACY_IMPORT_TAB_TO_SUBTYPE[tab];
  if (subtype) {
    return { tab: 'import', subtype };
  }
  return { tab: 'import', subtype: String(query.subtype || '') };
}

export function isExcelStorageKind(kind) {
  return !kind || kind === 'excel';
}
