/**
 * 填报说明指标定位匹配（与后端 stripRoman 规则对齐的轻量版）
 */

const ROMAN_PREFIX_RE = /^[ⅣⅢⅡⅠivxlcdm]+_/i;

export function stripRomanIndicatorPrefix(key) {
  return String(key || '').replace(ROMAN_PREFIX_RE, '');
}

/**
 * 节点是否命中查询指标（query 可为 4 / 4.1 / 25a / Ⅲ_4）
 */
export function indicatorNodeMatches(node, queryKey) {
  if (!node || node.nodeKind !== 'indicator') return false;
  const q = String(queryKey ?? '').trim();
  if (!q) return false;

  const key = String(node.indicatorKey || '').trim();
  if (key) {
    if (key === q || key.toLowerCase() === q.toLowerCase()) return true;
    const shortNode = stripRomanIndicatorPrefix(key);
    const shortQuery = stripRomanIndicatorPrefix(q);
    if (shortNode && (shortNode === q || shortNode === shortQuery)) return true;
  }

  if (node.indicatorNo != null && String(node.indicatorNo) === q) return true;
  return false;
}

export function subtreeHasIndicatorMatch(node, queryKey, nodeId = null) {
  if (!node) return false;
  if (nodeId != null && node.id === nodeId) return true;
  if (indicatorNodeMatches(node, queryKey)) return true;
  return (node.children || []).some((child) => subtreeHasIndicatorMatch(child, queryKey, nodeId));
}
