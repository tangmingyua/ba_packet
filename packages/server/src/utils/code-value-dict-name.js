/** 附录前缀列表；新增时追加即可（匹配时优先更长、更靠后的前缀） */
export const CODE_VALUE_APPENDIX_PREFIXES = ['详见附录A1'];

const TRAILING_PUNCT_RE = /[；;。，、.\s]+$/u;

/**
 * 从单元格文本提取码表名称（dict_name）。
 * RCPMIS：「详见附录A1」后的文字；无此前缀时（如反洗钱）取单元格全文。
 * @param {string} cellText
 * @param {string[]} [prefixes]
 * @returns {string|null}
 */
export function extractDictNameFromCellText(cellText, prefixes = CODE_VALUE_APPENDIX_PREFIXES) {
  const text = String(cellText ?? '').trim();
  if (!text || !prefixes?.length) return null;

  let bestIndex = -1;
  let matchedPrefix = '';

  for (const prefix of prefixes) {
    if (!prefix) continue;
    const idx = text.lastIndexOf(prefix);
    if (idx < 0) continue;
    if (idx > bestIndex || (idx === bestIndex && prefix.length > matchedPrefix.length)) {
      bestIndex = idx;
      matchedPrefix = prefix;
    }
  }

  if (bestIndex < 0 || !matchedPrefix) {
    const fallback = text.replace(TRAILING_PUNCT_RE, '').trim();
    return fallback || null;
  }

  let name = text.slice(bestIndex + matchedPrefix.length).trim();
  name = name.replace(TRAILING_PUNCT_RE, '').trim();
  return name || null;
}
