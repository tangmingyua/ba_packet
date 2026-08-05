/**
 * 子类解析方式（存储形态）与默认种子子类。
 * 配置类见 import-catalog-static.js；还原类种子见 SEED_SUBTYPES。
 */

export const STORAGE_KINDS = [
  { code: 'excel', label: '配置类' },
  { code: 'form_template', label: '表样 Excel 类' },
  { code: 'document', label: 'Word 类' },
  { code: 'script', label: 'SQL 类' },
  { code: 'code_value', label: '码值' },
];

/** 新建子类时可选的解析方式（产品定义的四种 + 码值） */
export const CREATABLE_STORAGE_KINDS = [
  'excel',
  'form_template',
  'document',
  'script',
  'code_value',
];

const STORAGE_KIND_LABEL = Object.fromEntries(STORAGE_KINDS.map((k) => [k.code, k.label]));

/** 首次安装时的示例子类（可被用户删除或自建同类型子类） */
/** @type {Array<{ code: string, name: string, moduleCode: string, category: string, storageKind: string, importEnabled?: boolean, sortOrder: number }>} */
export const SEED_SUBTYPES = [
  {
    code: '1104_FORM_TEMPLATE',
    name: '表样',
    moduleCode: '1104',
    category: 'norm',
    storageKind: 'form_template',
    importEnabled: true,
    sortOrder: 200,
  },
  {
    code: '1104_FILL_INSTRUCTION',
    name: '填报说明',
    moduleCode: '1104',
    category: 'norm',
    storageKind: 'document',
    importEnabled: true,
    sortOrder: 201,
  },
  {
    code: 'CONVERSION_SCRIPT',
    name: '转1104 脚本',
    moduleCode: 'YBT',
    category: 'composite',
    storageKind: 'script',
    importEnabled: true,
    sortOrder: 202,
  },
  {
    code: 'YBT_CODE_VALUE',
    name: '一表通码值',
    moduleCode: 'YBT',
    category: 'code_value',
    storageKind: 'code_value',
    importEnabled: true,
    sortOrder: 210,
  },
  {
    code: 'ybt_mapping_sample',
    name: '一表通 MAPPING SAMPLE',
    moduleCode: 'YBT',
    category: 'norm',
    storageKind: 'form_template',
    importEnabled: true,
    sortOrder: 205,
  },
  {
    code: 'EAST_CODE_VALUE',
    name: 'EAST码值',
    moduleCode: 'EAST',
    category: 'code_value',
    storageKind: 'code_value',
    importEnabled: true,
    sortOrder: 211,
  },
  {
    code: '1104_CODE_VALUE',
    name: '1104码值',
    moduleCode: '1104',
    category: 'code_value',
    storageKind: 'code_value',
    importEnabled: true,
    sortOrder: 212,
  },
  {
    code: 'IMAS_CODE_VALUE',
    name: 'IMAS码值',
    moduleCode: 'IMAS',
    category: 'code_value',
    storageKind: 'code_value',
    importEnabled: true,
    sortOrder: 213,
  },
];

const SEED_BY_CODE = Object.fromEntries(SEED_SUBTYPES.map((s) => [s.code, s]));

/** @deprecated 使用 SEED_SUBTYPES */
export const SYSTEM_SUBTYPES = SEED_SUBTYPES;

export function listStorageKinds() {
  return STORAGE_KINDS.map((k) => ({ ...k }));
}

export function listCreatableStorageKinds() {
  const allowed = new Set(CREATABLE_STORAGE_KINDS);
  return STORAGE_KINDS.filter((k) => allowed.has(k.code));
}

export function getStorageKindLabel(code) {
  return STORAGE_KIND_LABEL[code] || code || '配置类';
}

export function isSeedSubtypeCode(code) {
  return Boolean(SEED_BY_CODE[code]);
}

/** @deprecated 使用 isSeedSubtypeCode */
export function isSystemSubtypeCode(code) {
  return isSeedSubtypeCode(code);
}

/**
 * 按存储形态 + 模块推导默认种子子类 code（兼容旧导入，优先传 subtypeCode）
 */
export function resolveSubtypeCode(storageKind, moduleCode = '') {
  const kind = String(storageKind || '').trim();
  const mod = String(moduleCode || '').trim().toUpperCase();

  if (kind === 'script') return 'CONVERSION_SCRIPT';
  if (kind === 'code_value') return mod ? `${mod}_CODE_VALUE` : '';
  if (kind === 'form_template') return mod ? `${mod}_FORM_TEMPLATE` : '';
  if (kind === 'document') return mod ? `${mod}_FILL_INSTRUCTION` : '';
  return '';
}

export function getSeedSubtype(code) {
  return SEED_BY_CODE[code] ? { ...SEED_BY_CODE[code] } : null;
}

/** @deprecated 使用 getSeedSubtype */
export function getSystemSubtype(code) {
  return getSeedSubtype(code);
}
