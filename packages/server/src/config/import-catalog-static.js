/**
 * 资料导入静态目录（仅用于数据库种子初始化）
 */

export const MATERIAL_MODULES = [
  { code: 'YBT', name: '一表通', sortOrder: 0 },
  { code: 'EAST', name: 'EAST', sortOrder: 1 },
  { code: '1104', name: '1104', sortOrder: 2 },
];

export const MATERIAL_CATEGORIES = [
  { code: 'NORM', name: '规范类', tag: '规范' },
  { code: 'FAQ', name: '答疑类', tag: '答疑' },
];

export const MATERIAL_SUBTYPES = [
  {
    code: 'YBT_NORM',
    name: '一表通血缘规范',
    categoryCode: 'NORM',
    moduleName: '一表通',
    moduleCode: 'YBT',
    importEnabled: true,
    templateHint: 'YBT_ZL.xlsx（表名 + 数据项名称）',
  },
  {
    code: 'YBT_FAQ',
    name: '一表通制度问答',
    categoryCode: 'FAQ',
    moduleName: '一表通',
    moduleCode: 'YBT',
    importEnabled: true,
    templateHint: 'sheet「一表通制度问答」，表头第 2 行',
  },
  {
    code: 'FOUR_ATTR_FAQ',
    name: '四性校验问答',
    categoryCode: 'FAQ',
    moduleName: '一表通',
    moduleCode: 'YBT',
    importEnabled: false,
    templateHint: '待配置 Excel 模板',
  },
  {
    code: 'RECORD_CHECK_FAQ',
    name: '记录校验问答',
    categoryCode: 'FAQ',
    moduleName: '一表通',
    moduleCode: 'YBT',
    importEnabled: false,
    templateHint: '待配置 Excel 模板',
  },
  {
    code: 'CONSISTENCY_FAQ',
    name: '一致性校验问答',
    categoryCode: 'FAQ',
    moduleName: '一表通',
    moduleCode: 'YBT',
    importEnabled: false,
    templateHint: '待配置 Excel 模板',
  },
  {
    code: 'TO_EAST_FAQ',
    name: '转EAST问答',
    categoryCode: 'FAQ',
    moduleName: '一表通',
    moduleCode: 'YBT',
    importEnabled: false,
    templateHint: '待配置 Excel 模板',
  },
  {
    code: 'TO_1104_FAQ',
    name: '转1104问答',
    categoryCode: 'FAQ',
    moduleName: '一表通',
    moduleCode: 'YBT',
    importEnabled: false,
    templateHint: '待配置 Excel 模板',
  },
  {
    code: 'KEY_INDICATOR_FAQ',
    name: '重点指标问答',
    categoryCode: 'FAQ',
    moduleName: '一表通',
    moduleCode: 'YBT',
    importEnabled: false,
    templateHint: '待配置 Excel 模板',
  },
  {
    code: 'TO_CRR_FAQ',
    name: '转客户风险问答',
    categoryCode: 'FAQ',
    moduleName: '一表通',
    moduleCode: 'YBT',
    importEnabled: false,
    templateHint: '待配置 Excel 模板',
  },
  {
    code: 'PENETRATION_FAQ',
    name: '穿透层问答',
    categoryCode: 'FAQ',
    moduleName: '一表通',
    moduleCode: 'YBT',
    importEnabled: false,
    templateHint: '待配置 Excel 模板',
  },
];

export const RELEASE_MODES = ['单文件发布', '随监管制度发布'];
export const MATERIAL_TAGS = ['规范', '答疑'];

export const FAQ_MAIN_FIELDS = [
  '流程编号',
  '问题编号',
  '提出时间',
  '问题描述',
  '问题建议',
  '反馈意见',
  '反馈人',
  '反馈人联系方式',
];
