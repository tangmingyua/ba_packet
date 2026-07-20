/** 标准字段 code → 中文 label（与 server seed 对齐；运行时可通过 mergeFieldLabels 合并 API 数据） */
export const FIELD_LABEL_MAP = {
  subtype: '子类',
  version: '版本',
  data_item: '数据项',
  flow_no: '流程编号',
  question_no: '问题编号',
  proposed_at: '提出时间',
  question_type: '问题类型',
  question_desc: '问题描述',
  question_suggestion: '问题建议',
  lead_unit_advice: '牵头单位意见',
  bureau_opinion: '总局意见',
  feedback_opinion: '反馈意见',
  feedback_by: '反馈人',
  feedback_contact: '反馈人联系方式',
  flow_status: '流程状态',
  reporting_org: '填报机构',
  proposer: '提出人',
  proposer_contact: '提出人联系方式',
  proposing_org: '提出机构',
  feedback_unit: '反馈单位',
  data_item_code: '数据项编码',
  data_topic_name: '数据主题名称',
  table_no_main: '表号（主）',
  table_name_main: '表名（主）',
  table_no_sub: '表号（副）',
  table_name_sub: '表名（副）',
  table_no: '表号',
  table_code: '表编号',
  table_name: '表名',
  system_change_flag: '是否变更制度',
  data_element_desc: '数据元说明',
  source_table: '源表',
  source_field_name: '源字段',
  logic: '逻辑',
  collection_scope: '采集范围',
  data_source_scope: '数据范围',
  east_topic_name: 'EAST主题名称',
  east_table_name: 'EAST表名',
  east_field_name: 'EAST字段名',
  convert_issue_type: '转换问题类型',
  convert_work_stage: '转换工作阶段',
  business_rule_version: '业务规则版本',
  script_version: '脚本程序版本',
  change_east_mapping: '是否变更转EAST映射规则',
  change_east_script: '是否变更转EAST脚本',
  r1104_table_no: '1104表号',
  r1104_table_name: '1104表名',
  r1104_indicator: '1104指标',
  change_1104_mapping: '是否变更转1104映射规则',
  change_1104_script: '是否变更转1104脚本',
  key_indicator_seq: '重点指标序号',
  key_indicator_name: '重点指标名称',
  change_key_indicator_mapping: '是否变更重点指标映射规则',
  change_key_indicator_script: '是否变更重点指标脚本',
  crr_table_name: '客户风险表名',
  crr_field_name: '客户风险字段名',
  change_crr_mapping: '是否变更转客户风险映射规则',
  change_crr_script: '是否变更转客户风险脚本',
  check_rule_code: '校验规则编码',
  check_table_name: '校验表名',
  check_category_major: '校验大类',
  check_category_minor: '校验小类',
  check_scope: '校验范围',
  formula_desc: '公式说明',
  check_nature: '校验性质',
  check_method: '校验方式',
  governance_rule_version: '治理规则版本',
  missing_rate_daily: '缺失率阈值(单日）',
  missing_rate_monthly: '缺失率阈值(滚动1个月平均）',
  modify_suggestion: '修改建议',
  cross_system_table: '跨系统表名',
  set_a: 'A集合',
  set_b: 'B集合',
  set_c: 'C集合',
  set_d: 'D集合',
  set_e: 'E集合',
  abcde_relation: 'ABCDE的关系',
  penetration_issue_type: '问题类型',
  penetration_layer: '层级',
  penetration_table_name: '穿透表层名',
  indicator_code: '数据项/指标编码',
  indicator_name: '数据项/指标名称',
  change_data_norm: '是否变更数据规范',
  change_gen_tool: '是否变更生成工具',
  tool_category_to_change: '要变更的工具类别',
  remark: '备注',
};

let runtimeLabelMap = {};
/** @type {Record<string, Record<string, string>>} */
let runtimeMappingsByVersion = {};
/** @type {Record<string, string[]>} */
let runtimeMappingOrdersByVersion = {};
/** @type {Record<string, string[]>} */
let runtimeDefaultDisplayByVersion = {};

export function mergeFieldLabels(labels) {
  if (!labels || typeof labels !== 'object') return;
  runtimeLabelMap = { ...labels };
}

export function mergeFieldMappingsByVersion(mappingsByVersion) {
  runtimeMappingsByVersion = mappingsByVersion && typeof mappingsByVersion === 'object' ? mappingsByVersion : {};
}

export function mergeFieldMappingOrdersByVersion(ordersByVersion) {
  runtimeMappingOrdersByVersion =
    ordersByVersion && typeof ordersByVersion === 'object' ? ordersByVersion : {};
}

export function mergeFieldMappingDefaultDisplayByVersion(defaultDisplayByVersion) {
  runtimeDefaultDisplayByVersion =
    defaultDisplayByVersion && typeof defaultDisplayByVersion === 'object'
      ? defaultDisplayByVersion
      : {};
}

/** 合并各版本「默认展示」的 Excel 列名（仅含 allKeys 中存在的列） */
export function mergeDefaultDisplayLabels(allKeys) {
  const labels = [];
  const used = new Set();
  const versionIds = Object.keys(runtimeDefaultDisplayByVersion).sort();
  for (const vid of versionIds) {
    for (const col of runtimeDefaultDisplayByVersion[vid] || []) {
      if (allKeys.includes(col) && !used.has(col)) {
        labels.push(col);
        used.add(col);
      }
    }
  }
  return labels;
}

/** 合并各版本字段映射顺序，得到 Excel 列名排列（仅含 allKeys 中存在的列） */
export function mergeMappingOrderedLabels(allKeys) {
  const ordered = [];
  const used = new Set();
  const versionIds = Object.keys(runtimeMappingOrdersByVersion).sort();
  for (const vid of versionIds) {
    for (const col of runtimeMappingOrdersByVersion[vid] || []) {
      if (allKeys.includes(col) && !used.has(col)) {
        ordered.push(col);
        used.add(col);
      }
    }
  }
  return ordered;
}

/** 按版本字段映射取 Excel 原列名，无映射时回退标准中文 label */
export function excelColumnLabel(code, versionId) {
  if (!code) return '';
  const vid = versionId != null ? String(versionId) : '';
  const mapped = vid ? runtimeMappingsByVersion[vid]?.[code] : '';
  if (mapped) return mapped;
  return fieldLabel(code);
}

/** 某标准字段在所有版本映射下可能出现的 Excel 列名 */
export function excelColumnLabelsForCode(code, allKeys = null) {
  const labels = [];
  const seen = new Set();
  for (const map of Object.values(runtimeMappingsByVersion)) {
    const excel = map?.[code];
    if (excel && !seen.has(excel)) {
      seen.add(excel);
      labels.push(excel);
    }
  }
  const fallback = fieldLabel(code);
  if (fallback && !seen.has(fallback)) labels.push(fallback);
  if (allKeys) return labels.filter((l) => allKeys.includes(l));
  return labels;
}

export function fieldLabel(code) {
  if (!code) return '';
  return runtimeLabelMap[code] || FIELD_LABEL_MAP[code] || code;
}

/** payload 中用于解析业务「表名」的字段（按优先级） */
export const TABLE_NAME_PAYLOAD_KEYS = [
  'table_name',
  'table_name_main',
  'table_name_sub',
  'east_table_name',
  'r1104_table_name',
  'crr_table_name',
  'check_table_name',
  'penetration_table_name',
  'cross_system_table',
  'source_table',
];

export function pickTableNameFromPayload(payload = {}) {
  return pickTableNameFromPayloadWithKey(payload).value;
}

export function pickTableNameFromPayloadWithKey(payload = {}) {
  for (const key of TABLE_NAME_PAYLOAD_KEYS) {
    const val = payload[key];
    if (val != null && String(val).trim()) {
      return { key, value: String(val).trim() };
    }
  }
  return { key: '', value: '' };
}
