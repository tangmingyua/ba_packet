/** 资料标签：有/无记录时的护眼配色（浅底深字，绿/灰区分稍明显） */
export const CATEGORY_STATUS_COLORS = {
  hasRecords: {
    bg: '#D4E8DA',
    text: '#245032',
    border: '#9BC4A8',
    iconBg: 'rgba(36, 80, 50, 0.14)',
    selectedBorder: '#3F8B58',
    selectedBg: '#C2DFCA',
  },
  noRecords: {
    bg: '#E8EBEE',
    text: '#5A6570',
    border: '#CED4DA',
    iconBg: 'rgba(90, 101, 112, 0.1)',
    selectedBorder: '#8A939C',
    selectedBg: '#DDE1E5',
  },
  disabled: {
    bg: '#ECEEF0',
    text: '#9AA3AD',
    border: '#DDE1E6',
    iconBg: 'rgba(154, 163, 173, 0.12)',
    selectedBorder: '#9AA3AD',
    selectedBg: '#ECEEF0',
  },
};
/** 查询页资料标签卡片：图标按类型；背景色由 ModuleCategoryCards 按是否有记录决定 */
export const CATEGORY_CARD_THEMES = {
  norm: { icon: '规', bg: '#4472C4' },
  check: { icon: '检', bg: '#FFC000', text: '#5c4a00' },
  qa: { icon: '答', bg: '#70AD47' },
  logic: { icon: '逻', bg: '#7030A0' },
  peer: { icon: '同', bg: '#00B0F0' },
  composite: { icon: '综', bg: '#ED7D31' },
  code_value: { icon: '码', bg: '#FF6699' },
};

export function getCategoryCardTheme(code) {
  return CATEGORY_CARD_THEMES[code] || { icon: '·', bg: '#A5A5A5' };
}

export function getCategoryStatusColors(cat) {
  if (cat?.hasSubtype === false) return CATEGORY_STATUS_COLORS.disabled;
  if ((cat?.count ?? 0) > 0) return CATEGORY_STATUS_COLORS.hasRecords;
  return CATEGORY_STATUS_COLORS.noRecords;
}
