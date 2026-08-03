/** 查询页资料标签卡片视觉（对齐一表通风格） */
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
