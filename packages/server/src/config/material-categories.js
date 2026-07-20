/** 资料类型标签（子类 / 记录维度） */
export const MATERIAL_CATEGORIES = [
  { code: 'norm', label: '规范' },
  { code: 'check', label: '校验' },
  { code: 'qa', label: '答疑' },
  { code: 'logic', label: '逻辑' },
  { code: 'peer', label: '同业经验' },
];

const LABEL_TO_CODE = Object.fromEntries(
  MATERIAL_CATEGORIES.flatMap((c) => [
    [c.code, c.code],
    [c.label, c.code],
    [c.code.toUpperCase(), c.code],
  ])
);

LABEL_TO_CODE.faq = 'qa';
LABEL_TO_CODE.FAQ = 'qa';

export function listMaterialCategories() {
  return MATERIAL_CATEGORIES.map((c) => ({ ...c }));
}

export function isValidCategoryCode(code) {
  return MATERIAL_CATEGORIES.some((c) => c.code === code);
}

export function normalizeCategory(value, fallback = 'norm') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return isValidCategoryCode(fallback) ? fallback : 'norm';
  }
  const lower = raw.toLowerCase();
  if (LABEL_TO_CODE[raw]) return LABEL_TO_CODE[raw];
  if (LABEL_TO_CODE[lower]) return LABEL_TO_CODE[lower];
  return isValidCategoryCode(fallback) ? fallback : 'norm';
}

export function getCategoryLabel(code) {
  return MATERIAL_CATEGORIES.find((c) => c.code === code)?.label || '规范';
}

/** 解析 ?categories=norm,qa 或数组 */
export function parseCategoryFilter(input) {
  if (!input) return [];
  const list = Array.isArray(input)
    ? input
    : String(input)
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
  const normalized = [...new Set(list.map((v) => normalizeCategory(v)).filter(isValidCategoryCode))];
  return normalized;
}
