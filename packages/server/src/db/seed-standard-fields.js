/**
 * 新模型标准字段种子
 * 含系统三字段 + 答疑共有 + 规范常用 + EAST/1104/校验等特有字段
 * data_item 为统一「数据项」标准名（不再另建 data_item_name）
 */

/** @typedef {{ code: string, label: string, isSystem?: number, sortOrder: number }} StandardFieldSeed */

/** @type {StandardFieldSeed[]} */
export const STANDARD_FIELD_SEEDS = [
  // —— 系统 / 统一检索 ——
  { code: 'subtype', label: '子类', isSystem: 1, sortOrder: 1 },
  { code: 'version', label: '版本', isSystem: 1, sortOrder: 2 },
  { code: 'data_item', label: '数据项', isSystem: 0, sortOrder: 3 },

  // —— 答疑共有 ——
  { code: 'flow_no', label: '流程编号', sortOrder: 10 },
  { code: 'question_no', label: '问题编号', sortOrder: 11 },
  { code: 'proposed_at', label: '提出时间', sortOrder: 12 },
  { code: 'question_type', label: '问题类型', sortOrder: 12.5 },
  { code: 'question_desc', label: '问题描述', sortOrder: 13 },
  { code: 'question_suggestion', label: '问题建议', sortOrder: 14 },
  { code: 'lead_unit_advice', label: '牵头单位意见', sortOrder: 14.5 },
  { code: 'bureau_opinion', label: '总局意见', sortOrder: 14.6 },
  { code: 'feedback_opinion', label: '反馈意见', sortOrder: 15 },
  { code: 'feedback_by', label: '反馈人', sortOrder: 16 },
  { code: 'feedback_contact', label: '反馈人联系方式', sortOrder: 17 },
  { code: 'flow_status', label: '流程状态', sortOrder: 18 },
  { code: 'reporting_org', label: '填报机构', sortOrder: 19 },
  { code: 'proposer', label: '提出人', sortOrder: 20 },
  { code: 'proposer_contact', label: '提出人联系方式', sortOrder: 21 },
  { code: 'proposing_org', label: '提出机构', sortOrder: 22 },
  { code: 'feedback_unit', label: '反馈单位', sortOrder: 23 },
  { code: 'data_item_code', label: '数据项编码', sortOrder: 24 },
  { code: 'data_topic_name', label: '数据主题名称', sortOrder: 25 },

  // —— 一表通 / 主副表 ——
  { code: 'table_no_main', label: '表号（主）', sortOrder: 30 },
  { code: 'table_name_main', label: '表名（主）', sortOrder: 31 },
  { code: 'table_no_sub', label: '表号（副）', sortOrder: 32 },
  { code: 'table_name_sub', label: '表名（副）', sortOrder: 33 },
  { code: 'table_no', label: '表号', sortOrder: 34 },
  { code: 'table_code', label: '表编号', sortOrder: 35 },
  { code: 'table_name', label: '表名', sortOrder: 36 },
  { code: 'system_change_flag', label: '是否变更制度', sortOrder: 37 },

  // —— 规范类常用 ——
  { code: 'data_element_desc', label: '数据元说明', sortOrder: 40 },
  { code: 'source_table', label: '源表', sortOrder: 41 },
  { code: 'source_field_name', label: '源字段', sortOrder: 42 },
  { code: 'logic', label: '逻辑', sortOrder: 43 },
  { code: 'collection_scope', label: '采集范围', sortOrder: 44 },
  { code: 'data_source_scope', label: '数据范围', sortOrder: 45 },

  // —— 转 EAST ——
  { code: 'east_topic_name', label: 'EAST主题名称', sortOrder: 50 },
  { code: 'east_table_name', label: 'EAST表名', sortOrder: 51 },
  { code: 'east_field_name', label: 'EAST字段名', sortOrder: 52 },
  { code: 'convert_issue_type', label: '转换问题类型', sortOrder: 53 },
  { code: 'convert_work_stage', label: '转换工作阶段', sortOrder: 54 },
  { code: 'business_rule_version', label: '业务规则版本', sortOrder: 55 },
  { code: 'script_version', label: '脚本程序版本', sortOrder: 56 },
  { code: 'change_east_mapping', label: '是否变更转EAST映射规则', sortOrder: 57 },
  { code: 'change_east_script', label: '是否变更转EAST脚本', sortOrder: 58 },

  // —— 转 1104 ——
  { code: 'r1104_table_no', label: '1104表号', sortOrder: 60 },
  { code: 'r1104_table_name', label: '1104表名', sortOrder: 61 },
  { code: 'r1104_indicator', label: '1104指标', sortOrder: 62 },
  { code: 'change_1104_mapping', label: '是否变更转1104映射规则', sortOrder: 63 },
  { code: 'change_1104_script', label: '是否变更转1104脚本', sortOrder: 64 },

  // —— 重点指标 ——
  { code: 'key_indicator_seq', label: '重点指标序号', sortOrder: 70 },
  { code: 'key_indicator_name', label: '重点指标名称', sortOrder: 71 },
  { code: 'change_key_indicator_mapping', label: '是否变更重点指标映射规则', sortOrder: 72 },
  { code: 'change_key_indicator_script', label: '是否变更重点指标脚本', sortOrder: 73 },

  // —— 客户风险 ——
  { code: 'crr_table_name', label: '客户风险表名', sortOrder: 80 },
  { code: 'crr_field_name', label: '客户风险字段名', sortOrder: 81 },
  { code: 'change_crr_mapping', label: '是否变更转客户风险映射规则', sortOrder: 82 },
  { code: 'change_crr_script', label: '是否变更转客户风险脚本', sortOrder: 83 },

  // —— 校验类（四性 / 记录 / 一致性）——
  { code: 'check_rule_code', label: '校验规则编码', sortOrder: 90 },
  { code: 'check_table_name', label: '校验表名', sortOrder: 91 },
  { code: 'check_category_major', label: '校验大类', sortOrder: 92 },
  { code: 'check_category_minor', label: '校验小类', sortOrder: 93 },
  { code: 'check_scope', label: '校验范围', sortOrder: 94 },
  { code: 'formula_desc', label: '公式说明', sortOrder: 95 },
  { code: 'check_nature', label: '校验性质', sortOrder: 96 },
  { code: 'check_method', label: '校验方式', sortOrder: 97 },
  { code: 'governance_rule_version', label: '治理规则版本', sortOrder: 98 },
  { code: 'missing_rate_daily', label: '缺失率阈值(单日）', sortOrder: 99 },
  { code: 'missing_rate_monthly', label: '缺失率阈值(滚动1个月平均）', sortOrder: 100 },
  { code: 'modify_suggestion', label: '修改建议', sortOrder: 101 },
  { code: 'cross_system_table', label: '跨系统表名', sortOrder: 102 },
  { code: 'set_a', label: 'A集合', sortOrder: 103 },
  { code: 'set_b', label: 'B集合', sortOrder: 104 },
  { code: 'set_c', label: 'C集合', sortOrder: 105 },
  { code: 'set_d', label: 'D集合', sortOrder: 106 },
  { code: 'set_e', label: 'E集合', sortOrder: 107 },
  { code: 'abcde_relation', label: 'ABCDE的关系', sortOrder: 108 },

  // —— 穿透层 ——
  { code: 'penetration_issue_type', label: '问题类型', sortOrder: 110 },
  { code: 'penetration_layer', label: '层级', sortOrder: 111 },
  { code: 'penetration_table_name', label: '穿透表层名', sortOrder: 112 },
  { code: 'indicator_code', label: '数据项/指标编码', sortOrder: 113 },
  { code: 'indicator_name', label: '数据项/指标名称', sortOrder: 114 },
  { code: 'change_data_norm', label: '是否变更数据规范', sortOrder: 115 },
  { code: 'change_gen_tool', label: '是否变更生成工具', sortOrder: 116 },
  { code: 'tool_category_to_change', label: '要变更的工具类别', sortOrder: 117 },
];

/** EAST 相关标准字段 code（便于测试与文档） */
export const EAST_STANDARD_FIELD_CODES = [
  'east_topic_name',
  'east_table_name',
  'east_field_name',
  'convert_issue_type',
  'convert_work_stage',
  'business_rule_version',
  'script_version',
  'change_east_mapping',
  'change_east_script',
];
