/** 预览缩放范围（百分比） */
export const PREVIEW_ZOOM = {
  min: 50,
  max: 200,
  step: 10,
  default: 100,
};

/** 获取 Word 预览中应缩放的内容根节点 */
export function getPreviewZoomTarget(container) {
  if (!container) return null;
  return container.querySelector('.docx-wrapper') || container.querySelector('.wf-doc') || container;
}

/** 对 Word 预览内容应用缩放（50%–200%） */
export function applyPreviewZoom(container, percent = PREVIEW_ZOOM.default) {
  const target = getPreviewZoomTarget(container);
  if (!target) return;

  const clamped = Math.max(PREVIEW_ZOOM.min, Math.min(PREVIEW_ZOOM.max, Number(percent) || PREVIEW_ZOOM.default));
  const scale = clamped / 100;

  if (scale === 1) {
    target.style.zoom = '';
    target.style.transform = '';
    target.style.transformOrigin = '';
    target.style.width = '';
  } else {
    target.style.zoom = String(scale);
    target.style.transform = '';
    target.style.transformOrigin = '';
    target.style.width = '';
  }
}

/** 阻止 Word 预览区内 # 锚点链接触发 Hash 路由跳转（如 /#/_Toc…） */
export function preventPreviewHashLinkNavigation(event) {
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!anchor || !event.currentTarget?.contains(anchor)) return;

  const href = String(anchor.getAttribute('href') ?? '').trim();
  if (!href || href.startsWith('#')) {
    event.preventDefault();
  }
}

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

function compareDomOrder(a, b) {
  if (a === b) return 0;
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/** 在预览 DOM 中找与块文本最匹配的段落/单元格容器 */
function findScopeCandidates(container, blockText) {
  const normalized = normalizeText(blockText);
  if (!container || !normalized) return [];

  /** @type {{ el: Element, score: number }[]} */
  const results = [];
  const selector = 'p, li, td, th, h1, h2, h3, h4, h5, h6, div[data-wf-block]';

  container.querySelectorAll(selector).forEach((el) => {
    const t = normalizeText(el.textContent);
    if (t.length < 4) return;

    if (t === normalized) {
      results.push({ el, score: 1000 });
      return;
    }
    if (normalized.length >= 6 && t.includes(normalized)) {
      results.push({ el, score: 800 + Math.min(normalized.length, 200) });
      return;
    }
    if (t.length >= 6 && normalized.includes(t)) {
      results.push({ el, score: 500 + Math.min(t.length, 200) });
      return;
    }

    const prefixLen = Math.min(28, normalized.length, t.length);
    if (prefixLen >= 10) {
      const prefix = normalized.slice(0, prefixLen);
      if (t.startsWith(prefix) || normalized.startsWith(t.slice(0, prefixLen))) {
        results.push({ el, score: 300 + prefixLen });
      }
    }
  });

  results.sort((a, b) => b.score - a.score || compareDomOrder(a.el, b.el));
  return results;
}

function pickScopeElement(candidates, hit) {
  if (!candidates.length) return null;
  const topScore = candidates[0].score;
  const tied = candidates.filter((c) => c.score >= topScore - 80);
  if (tied.length === 1) return tied[0].el;

  tied.sort((a, b) => compareDomOrder(a.el, b.el));

  // 目录与正文重复标题：优先取正文中较后出现的块
  const exact = tied.filter((c) => c.score >= 1000);
  if (exact.length > 1) return exact[exact.length - 1].el;

  const sortOrder = hit?.sortOrder;
  if (sortOrder != null && tied.length > 1) {
    const idx = Math.min(tied.length - 1, Math.max(0, Math.floor((sortOrder / 300) * tied.length)));
    return tied[idx].el;
  }
  return tied[tied.length - 1].el;
}

function findMatchIndexInScope(matches, scopeEl) {
  for (let i = 0; i < matches.length; i += 1) {
    if (scopeEl.contains(matches[i].node)) return i;
  }
  return -1;
}

/** 在可滚动容器内将元素滚到可视区域中央 */
export function scrollToElementInContainer(scrollContainer, element) {
  if (!scrollContainer || !element) return;
  if (!scrollContainer.contains(element)) {
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();
  const offset =
    elRect.top - containerRect.top + scrollContainer.scrollTop - scrollContainer.clientHeight / 2 + elRect.height / 2;

  scrollContainer.scrollTo({
    top: Math.max(0, offset),
    behavior: 'smooth',
  });
}

/**
 * 高亮容器内全部匹配，并滚动到 activeIndex 处
 * @returns {{ total: number, activeIndex: number }}
 */
export function applyFindHighlight(container, keyword, activeIndex = 0, scrollContainer = null) {
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
  const scrollRoot = scrollContainer || container;
  if (activeMark) {
    scrollToElementInContainer(scrollRoot, activeMark);
  }

  return { total: matches.length, activeIndex: idx };
}

/** 将 API 命中项映射到 DOM 内第几处关键词匹配 */
export function resolveMatchIndexForHit(container, keyword, hit, hitListIndex = 0) {
  const matches = findAllTextMatches(container, keyword);
  if (!matches.length) return 0;

  const blockText = normalizeText(hit?.text);

  if (hit?.sortOrder != null) {
    const blockEl = container.querySelector(`[data-wf-block="${hit.sortOrder}"]`);
    if (blockEl) {
      const idx = findMatchIndexInScope(matches, blockEl);
      if (idx >= 0) return idx;
    }
  }

  if (blockText) {
    const candidates = findScopeCandidates(container, blockText);
    const scopeEl = pickScopeElement(candidates, hit);
    if (scopeEl) {
      const idx = findMatchIndexInScope(matches, scopeEl);
      if (idx >= 0) return idx;
    }

    const snippet = normalizeText(hit?.snippet);
    if (snippet.length > blockText.length) {
      const snippetCandidates = findScopeCandidates(container, snippet);
      const snippetScope = pickScopeElement(snippetCandidates, hit);
      if (snippetScope) {
        const idx = findMatchIndexInScope(matches, snippetScope);
        if (idx >= 0) return idx;
      }
    }
  }

  return Math.min(Math.max(0, hitListIndex), matches.length - 1);
}
