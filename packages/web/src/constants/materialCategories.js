/** 与 server material-categories.js 保持一致 */
export const MATERIAL_CATEGORIES = [
  { code: 'norm', label: '规范' },
  { code: 'check', label: '校验' },
  { code: 'qa', label: '答疑' },
  { code: 'logic', label: '逻辑' },
  { code: 'peer', label: '同业经验' },
  { code: 'changelog', label: '变更记录' },
  { code: 'to1104', label: 'sql转换' },
  { code: 'code_value', label: '码值' },
];

export function getCategoryLabel(code) {
  return MATERIAL_CATEGORIES.find((c) => c.code === code)?.label || '规范';
}

export function parseCategoryFilter(input) {
  if (!input) return [];
  const list = Array.isArray(input)
    ? input
    : String(input)
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
  const codes = new Set(MATERIAL_CATEGORIES.map((c) => c.code));
  return [...new Set(list.filter((c) => codes.has(c)))];
}

/** 解析 ?subtypeCode=A,B 或数组 */
export function parseSubtypeFilter(input) {
  if (!input) return [];
  const list = Array.isArray(input)
    ? input
    : String(input)
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
  return [...new Set(list)];
}
