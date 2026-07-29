/** 与 server system-subtypes.js STORAGE_KINDS 对齐 */
export const SUBTYPE_PARSE_KINDS = [
  {
    code: 'excel',
    label: '配置类',
    hint: 'Excel 行数据，一行一条记录；须配置版本与字段映射',
  },
  {
    code: 'form_template',
    label: '表样 Excel 类',
    hint: '表样 Excel 还原为矩阵结构，无需字段映射',
  },
  {
    code: 'document',
    label: 'Word 类',
    hint: 'Word 文档还原为节点树，无需字段映射',
  },
  {
    code: 'script',
    label: 'SQL 类',
    hint: 'SQL/TXT 脚本还原，无需字段映射',
  },
  {
    code: 'code_value',
    label: '码值',
    hint: '码值 Excel 批量导入，无需字段映射',
  },
];

export function getParseKindLabel(code) {
  return SUBTYPE_PARSE_KINDS.find((k) => k.code === code)?.label || code || '配置类';
}

export function getParseKindHint(code) {
  return SUBTYPE_PARSE_KINDS.find((k) => k.code === code)?.hint || '';
}
