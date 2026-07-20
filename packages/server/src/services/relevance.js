/**
 * 联想/搜索相关度排序
 * 完全匹配 > 前缀匹配 > 包含匹配，同分时短名称优先
 */

/**
 * 计算单条数据项与关键词的相关度分数（越高越靠前）
 * @param {string} dataItemName - 数据项名称
 * @param {string} keyword - 搜索关键词
 */
export function scoreRelevance(dataItemName, keyword) {
  const name = String(dataItemName ?? '');
  const kw = String(keyword ?? '').trim();
  if (!kw || !name.includes(kw)) return 0;

  if (name === kw) return 1000;
  if (name.startsWith(kw)) return 500 + (100 - Math.min(name.length, 100));
  const index = name.indexOf(kw);
  return 200 - index + (100 - Math.min(name.length, 100));
}

/**
 * 对查询结果按相关度降序排列
 * @param {Array} items - 原始记录数组
 * @param {string} keyword - 搜索关键词
 * @param {string} nameKey - 数据项名称字段名，默认 data_item_name
 */
export function sortByRelevance(items, keyword, nameKey = 'data_item_name') {
  return [...items]
    .map((item) => ({
      ...item,
      _score: scoreRelevance(item[nameKey], keyword),
    }))
    .filter((item) => item._score > 0)
    .sort((a, b) => b._score - a._score || a[nameKey].length - b[nameKey].length)
    .map(({ _score, ...rest }) => rest);
}
