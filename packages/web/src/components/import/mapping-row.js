let nextRowId = 1;

/** 创建带稳定 key 的映射行（用于拖拽排序） */
export function createMappingRow(data = {}) {
  return {
    _rowId: nextRowId++,
    originalColumn: '',
    standardField: '',
    isRequired: false,
    defaultDisplay: false,
    ...data,
  };
}

/** 保存 API 前去掉内部字段 */
export function toMappingPayload(rows) {
  return rows.map(({ _rowId, ...rest }) => rest);
}
