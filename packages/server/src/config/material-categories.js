/** 资料类型标签（子类 / 记录维度） */
export const MATERIAL_CATEGORIES = [
  { code: 'norm', label: '规范' },
  { code: 'check', label: '校验' },
  { code: 'qa', label: '答疑' },
  { code: 'logic', label: '逻辑' },
  { code: 'peer', label: '同业经验' },
  { code: 'composite', label: '综合' },
  { code: 'code_value', label: '码值' },
];

/** 查询页（聚合）固定展示的资料标签，不含码值 */
export const QUERY_DISPLAY_CATEGORIES = ['norm', 'logic', 'check', 'qa', 'peer', 'composite'];

/** 已合并进 composite 的旧 code（库内子类/记录可能仍存在） */
export const LEGACY_COMPOSITE_CATEGORY_CODES = ['changelog', 'to1104'];

const LABEL_TO_CODE = Object.fromEntries(
  MATERIAL_CATEGORIES.flatMap((c) => [
    [c.code, c.code],
    [c.label, c.code],
    [c.code.toUpperCase(), c.code],
  ])
);

LABEL_TO_CODE.faq = 'qa';
LABEL_TO_CODE.FAQ = 'qa';
LABEL_TO_CODE.changelog = 'composite';
LABEL_TO_CODE.to1104 = 'composite';
LABEL_TO_CODE['变更记录'] = 'composite';
LABEL_TO_CODE['sql转换'] = 'composite';
LABEL_TO_CODE['SQL转换'] = 'composite';

const VALID_CATEGORY_CODES = new Set(MATERIAL_CATEGORIES.map((c) => c.code));

export function listMaterialCategories() {
  return MATERIAL_CATEGORIES.map((c) => ({ ...c }));
}

export function isValidCategoryCode(code) {
  return VALID_CATEGORY_CODES.has(String(code ?? '').trim());
}

export function normalizeCategory(value, fallback = 'norm') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return isValidCategoryCode(fallback) ? fallback : 'norm';
  }
  const lower = raw.toLowerCase();
  if (LABEL_TO_CODE[raw]) return LABEL_TO_CODE[raw];
  if (LABEL_TO_CODE[lower]) return LABEL_TO_CODE[lower];
  if (VALID_CATEGORY_CODES.has(lower)) return lower;
  return isValidCategoryCode(fallback) ? fallback : 'norm';
}

/** SQL / 统计用：composite 展开为库内可能出现的 category 值 */
export function expandCategoryStorageCodes(code) {
  const c = normalizeCategory(code);
  if (c === 'composite') {
    return ['composite', ...LEGACY_COMPOSITE_CATEGORY_CODES];
  }
  return [c];
}

export function expandCategoriesForStorage(codes) {
  const out = new Set();
  for (const code of codes || []) {
    for (const c of expandCategoryStorageCodes(code)) {
      out.add(c);
    }
  }
  return [...out];
}

export function getCategoryLabel(code) {
  const normalized = normalizeCategory(code, '');
  return MATERIAL_CATEGORIES.find((c) => c.code === normalized)?.label || '规范';
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
