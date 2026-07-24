export const CODE_VALUE_EXTEND_COUNT = 11;

const CORE_FIELD_KEYS = new Set(['dict_name', 'code', 'meaning']);

const CORE_FIELDS = [
  { key: 'dict_name', label: '码值名称', defaultOrder: 1 },
  { key: 'code', label: '码值代码', defaultOrder: 2 },
  { key: 'meaning', label: '码值含义', defaultOrder: 3 },
];

/** 默认码值表列（与码值维护预览一致） */
export function defaultCodeValueColumns() {
  const extendCols = Array.from({ length: CODE_VALUE_EXTEND_COUNT }, (_, i) => ({
    key: `extend_${i + 1}`,
    label: `扩展字段${i + 1}`,
    defaultOrder: i + 4,
  }));
  return [...CORE_FIELDS, ...extendCols];
}

/**
 * 搜索弹窗等场景：前三列固定展示；扩展字段仅在 module_code_dict_display 有配置时展示。
 * @param {Array<{ fieldKey: string, displayLabel?: string, sortOrder?: number, visible?: boolean }>} display
 */
export function buildCodeValueTableColumns(display = []) {
  const byKey = new Map((display || []).map((row) => [row.fieldKey, row]));
  const columns = [];

  for (const def of defaultCodeValueColumns()) {
    const cfg = byKey.get(def.key);
    if (CORE_FIELD_KEYS.has(def.key)) {
      columns.push({
        key: def.key,
        label: (cfg?.displayLabel || '').trim() || def.label,
        sortOrder: cfg?.sortOrder ?? def.defaultOrder,
      });
      continue;
    }
    if (!cfg || cfg.visible === false) continue;
    columns.push({
      key: def.key,
      label: (cfg.displayLabel || '').trim() || def.label,
      sortOrder: cfg.sortOrder ?? def.defaultOrder,
    });
  }

  return columns.sort((a, b) => a.sortOrder - b.sortOrder);
}
