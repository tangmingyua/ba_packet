/** 与 server material-categories.js 保持一致 */
export const MATERIAL_CATEGORIES = [
  { code: 'norm', label: '规范' },
  { code: 'check', label: '校验' },
  { code: 'qa', label: '答疑' },
  { code: 'logic', label: '逻辑' },
  { code: 'peer', label: '同业经验' },
  { code: 'composite', label: '综合' },
  { code: 'code_value', label: '码值' },
];

export const QUERY_DISPLAY_CATEGORIES = ['norm', 'logic', 'check', 'qa', 'peer', 'composite'];

const LABEL_TO_CODE = Object.fromEntries(
  MATERIAL_CATEGORIES.flatMap((c) => [
    [c.code, c.code],
    [c.label, c.code],
  ])
);
LABEL_TO_CODE.changelog = 'composite';
LABEL_TO_CODE.to1104 = 'composite';
LABEL_TO_CODE['变更记录'] = 'composite';
LABEL_TO_CODE['sql转换'] = 'composite';

export function normalizeCategory(value, fallback = 'norm') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (LABEL_TO_CODE[raw]) return LABEL_TO_CODE[raw];
  if (LABEL_TO_CODE[lower]) return LABEL_TO_CODE[lower];
  if (MATERIAL_CATEGORIES.some((c) => c.code === lower)) return lower;
  return fallback;
}

export function getCategoryLabel(code) {
  const normalized = normalizeCategory(code, '');
  return MATERIAL_CATEGORIES.find((c) => c.code === normalized)?.label || '规范';
}

export function parseCategoryFilter(input) {
  if (!input) return [];
  const list = Array.isArray(input)
    ? input
    : String(input)
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
  const valid = new Set(MATERIAL_CATEGORIES.map((c) => c.code));
  return [...new Set(list.map((v) => normalizeCategory(v)).filter((c) => valid.has(c)))];
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
