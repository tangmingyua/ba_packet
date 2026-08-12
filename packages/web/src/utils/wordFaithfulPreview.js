function normalizeText(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 清除预览区内 find 高亮 */
export function clearFindHighlights(container) {
  if (!container) return;
  container.querySelectorAll('mark.wf-find-match, mark.wf-find-active').forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  });
}

/** 在容器内收集关键词所有文本匹配（DOM 顺序） */
export function findAllTextMatches(container, keyword) {
  const q = String(keyword ?? '').trim();
  if (!container || !q) return [];

  const lower = q.toLowerCase();
  /** @type {{ node: Text, start: number, end: number }[]} */
  const matches = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest('mark.wf-find-match, mark.wf-find-active')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const node = /** @type {Text} */ (walker.currentNode);
    const text = node.textContent || '';
    let pos = 0;
    let idx = text.toLowerCase().indexOf(lower, pos);
    while (idx >= 0) {
      matches.push({ node, start: idx, end: idx + q.length });
      pos = idx + 1;
      idx = text.toLowerCase().indexOf(lower, pos);
    }
  }
  return matches;
}

/**
 * 高亮容器内全部匹配，并滚动到 activeIndex 处
 * @returns {{ total: number, activeIndex: number }}
 */
export function applyFindHighlight(container, keyword, activeIndex = 0) {
  clearFindHighlights(container);
  const q = String(keyword ?? '').trim();
  if (!container || !q) return { total: 0, activeIndex: -1 };

  const matches = findAllTextMatches(container, q);
  if (!matches.length) return { total: 0, activeIndex: -1 };

  const idx = Math.max(0, Math.min(activeIndex, matches.length - 1));

  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const m = matches[i];
    try {
      const range = document.createRange();
      range.setStart(m.node, m.start);
      range.setEnd(m.node, m.end);
      const mark = document.createElement('mark');
      mark.className = i === idx ? 'wf-find-active' : 'wf-find-match';
      range.surroundContents(mark);
    } catch {
      // 跨节点边界时跳过
    }
  }

  const activeMark = container.querySelector('mark.wf-find-active');
  activeMark?.scrollIntoView({ block: 'center', behavior: 'smooth' });

  return { total: matches.length, activeIndex: idx };
}

/** 将 API 命中项映射到 DOM 内第几处关键词匹配 */
export function resolveMatchIndexForHit(container, keyword, hit, hitListIndex = 0) {
  const matches = findAllTextMatches(container, keyword);
  if (!matches.length) return 0;

  const blockText = normalizeText(hit?.text);
  if (!blockText) {
    return Math.min(Math.max(0, hitListIndex), matches.length - 1);
  }

  for (let i = 0; i < matches.length; i += 1) {
    let el = matches[i].node.parentElement;
    while (el && el !== container) {
      const t = normalizeText(el.textContent);
      if (
        t === blockText ||
        (blockText.length >= 4 && t.includes(blockText)) ||
        (t.length >= 4 && blockText.includes(t))
      ) {
        return i;
      }
      el = el.parentElement;
    }
  }

  return Math.min(Math.max(0, hitListIndex), matches.length - 1);
}
