<template>
  <div class="script-preview">
    <div class="script-preview-toolbar">
      <div class="toolbar-search">
        <input
          v-model="contentSearch"
          type="search"
          class="search-input"
          placeholder="在脚本内搜索…"
          @keydown.enter.prevent="goNextMatch"
        />
        <button
          type="button"
          class="btn btn-sm"
          :disabled="!matchCount"
          @click="goNextMatch"
        >
          下一个
        </button>
        <span v-if="contentSearch.trim()" class="match-count">
          {{ matchCount ? `${activeDisplayIndex}/${matchCount}` : '无匹配' }}
        </span>
      </div>
      <div class="toolbar-actions">
        <span class="muted">{{ lineCount }} 行</span>
        <button type="button" class="btn btn-sm" @click="copyAll">
          {{ copied ? '已复制' : '复制全文' }}
        </button>
      </div>
    </div>
    <div ref="previewBodyRef" class="script-preview-body">
      <pre class="script-lines">
        <code
          v-for="(line, i) in lines"
          :key="i"
          class="script-line"
          :class="{ 'active-line': i === activeLineIndex }"
        >
          <span class="line-no">{{ i + 1 }}</span>
          <span class="line-text" v-html="highlightLine(i, line)" />
        </code>
      </pre>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps({
  text: { type: String, default: '' },
});

const contentSearch = ref('');
const activeMatchIndex = ref(-1);
const previewBodyRef = ref(null);
const copied = ref(false);
let copiedTimer = null;

const SQL_KEYWORD_RE =
  /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|VIEW|INDEX|AS|GROUP|BY|ORDER|HAVING|UNION|DISTINCT|NULL|NOT|IN|EXISTS|CASE|WHEN|THEN|ELSE|END|WITH|LIMIT|OFFSET|PRIMARY|KEY|FOREIGN|REFERENCES|ALTER|DROP|IF|REPLACE|TRUNCATE|COMMIT|ROLLBACK|BEGIN|TRANSACTION|DECLARE|EXEC|EXECUTE|USE|DATABASE|SCHEMA|GRANT|REVOKE|LIKE|BETWEEN|IS|CAST|COALESCE|COUNT|SUM|AVG|MIN|MAX|OVER|PARTITION|ROW_NUMBER|RANK|DENSE_RANK|LEAD|LAG|FETCH|NEXT|ONLY|ROWS|RANGE|UNBOUNDED|PRECEDING|FOLLOWING|CURRENT|ROW|CROSS|FULL|NATURAL|USING|ALL|ANY|SOME|INTERSECT|EXCEPT|MINUS|CONSTRAINT|DEFAULT|CHECK|UNIQUE|AUTOINCREMENT|INTEGER|TEXT|VARCHAR|CHAR|DECIMAL|NUMERIC|DATE|TIME|TIMESTAMP|BOOLEAN|BLOB|COLLATE|ASC|DESC|TOP|PERCENT|TIES|FOR|OF|TO|ADD|COLUMN|MODIFY|RENAME|COMMENT|SEQUENCE|TRIGGER|PROCEDURE|FUNCTION|RETURN|RETURNS|LANGUAGE|IMMUTABLE|STABLE|VOLATILE|SECURITY|DEFINER|INVOKER|TEMP|TEMPORARY|GLOBAL|LOCAL|SESSION|TABLESAMPLE|LATERAL|WINDOW|FILTER|WITHIN|GROUPING|SETS|CUBE|ROLLUP|PIVOT|UNPIVOT|MATCH|RECOGNIZE|MEASURES|PATTERN|DEFINE|SUBSTRING|TRIM|UPPER|LOWER|LENGTH|CONCAT|SUBSTR|NVL|DECODE|GREATEST|LEAST|ABS|ROUND|FLOOR|CEIL|MOD|POWER|SQRT|EXP|LN|LOG|SIGN|RANDOM|NOW|CURRENT_DATE|CURRENT_TIME|CURRENT_TIMESTAMP|EXTRACT|DATEADD|DATEDIFF|DATEPART|YEAR|MONTH|DAY|HOUR|MINUTE|SECOND|WEEK|QUARTER|STRFTIME|DATETIME|JULIANDAY|UNION ALL|GROUP BY|ORDER BY|INSERT INTO|DELETE FROM|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|CROSS JOIN|OUTER JOIN|NOT NULL|PRIMARY KEY|FOREIGN KEY)\b/gi;

const lines = computed(() => {
  const raw = String(props.text ?? '');
  if (!raw) return [''];
  return raw.replace(/\r\n/g, '\n').split('\n');
});

const lineCount = computed(() => lines.value.length);

const searchTerm = computed(() => contentSearch.value.trim());

const searchMatches = computed(() => {
  const term = searchTerm.value;
  if (!term) return [];
  const raw = String(props.text ?? '');
  const re = new RegExp(escapeRegExp(term), 'gi');
  const matches = [];
  let m;
  while ((m = re.exec(raw)) !== null) {
    const before = raw.slice(0, m.index);
    const line = before.split('\n').length - 1;
    const lineStart = before.lastIndexOf('\n') + 1;
    matches.push({
      line,
      col: m.index - lineStart,
      length: m[0].length,
      index: matches.length,
    });
  }
  return matches;
});

const matchCount = computed(() => searchMatches.value.length);

const activeDisplayIndex = computed(() =>
  activeMatchIndex.value >= 0 && matchCount.value ? activeMatchIndex.value + 1 : 0
);

const activeLineIndex = computed(() => {
  if (activeMatchIndex.value < 0) return -1;
  return searchMatches.value[activeMatchIndex.value]?.line ?? -1;
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function applySqlKeywords(escaped) {
  return escaped.replace(SQL_KEYWORD_RE, (m) => `<span class="sql-kw">${m}</span>`);
}

function highlightLine(lineIndex, line) {
  const rawLine = line ?? '';
  if (!String(rawLine).trim() && rawLine === '') return '&nbsp;';

  const term = searchTerm.value;
  if (term) {
    const lineMatches = searchMatches.value
      .filter((m) => m.line === lineIndex)
      .sort((a, b) => a.col - b.col);
    if (!lineMatches.length) {
      return escapeHtml(rawLine) || '&nbsp;';
    }
    let result = '';
    let pos = 0;
    for (const m of lineMatches) {
      result += escapeHtml(rawLine.slice(pos, m.col));
      const hitText = rawLine.slice(m.col, m.col + m.length);
      const cls = m.index === activeMatchIndex.value ? 'search-hit active' : 'search-hit';
      result += `<span class="${cls}">${escapeHtml(hitText)}</span>`;
      pos = m.col + m.length;
    }
    result += escapeHtml(rawLine.slice(pos));
    return result || '&nbsp;';
  }

  const escaped = escapeHtml(rawLine);
  if (!escaped.trim()) return '&nbsp;';
  return applySqlKeywords(escaped);
}

function goNextMatch() {
  if (!matchCount.value) return;
  if (activeMatchIndex.value < 0) {
    activeMatchIndex.value = 0;
    return;
  }
  activeMatchIndex.value = (activeMatchIndex.value + 1) % matchCount.value;
}

async function scrollToActiveMatch() {
  await nextTick();
  previewBodyRef.value?.querySelector('.search-hit.active')?.scrollIntoView({
    block: 'center',
    behavior: 'smooth',
  });
}

async function copyAll() {
  const text = String(props.text ?? '');
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    /* ignore */
  }
}

watch(
  () => props.text,
  () => {
    copied.value = false;
    contentSearch.value = '';
    activeMatchIndex.value = -1;
  }
);

watch(contentSearch, () => {
  activeMatchIndex.value = matchCount.value ? 0 : -1;
});

watch(activeMatchIndex, () => {
  if (activeMatchIndex.value >= 0) scrollToActiveMatch();
});
</script>

<style scoped>
.script-preview {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #0f172a;
  color: #e2e8f0;
}

.script-preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #334155;
  background: #1e293b;
}

.toolbar-search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 200px;
}

.search-input {
  flex: 1;
  min-width: 140px;
  max-width: 280px;
  padding: 6px 10px;
  border: 1px solid #475569;
  border-radius: var(--radius-sm);
  background: #0f172a;
  color: #e2e8f0;
  font-size: 13px;
}

.search-input::placeholder {
  color: #64748b;
}

.match-count {
  font-size: 12px;
  color: #94a3b8;
  min-width: 3em;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.script-preview-body {
  flex: 1;
  overflow: auto;
  min-height: 200px;
}

.script-lines {
  margin: 0;
  padding: 12px 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
}

.script-line {
  display: flex;
  white-space: pre;
}

.script-line.active-line {
  background: rgba(251, 191, 36, 0.08);
}

.line-no {
  flex: 0 0 3.5em;
  padding: 0 12px 0 8px;
  text-align: right;
  color: #64748b;
  user-select: none;
  border-right: 1px solid #334155;
  margin-right: 12px;
}

.line-text {
  flex: 1;
  padding-right: 16px;
  color: #e2e8f0;
}

.line-text :deep(.sql-kw) {
  color: #7dd3fc;
  font-weight: 600;
}

.line-text :deep(.search-hit) {
  background: #854d0e;
  color: #fef3c7;
  border-radius: 2px;
  padding: 0 1px;
}

.line-text :deep(.search-hit.active) {
  background: #f59e0b;
  color: #1e293b;
  outline: 1px solid #fcd34d;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.muted {
  color: #94a3b8;
  font-size: 12px;
}
</style>
