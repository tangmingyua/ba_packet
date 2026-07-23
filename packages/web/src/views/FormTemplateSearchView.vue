<template>
  <section class="fts-page">
    <p class="hint test-banner">
      搜索表样名称/表号、表头与指标名；点击指标可查看填报说明。
    </p>

    <form class="search-bar" @submit.prevent="runSearch">
      <label class="search-field">
        <span class="label">关键词</span>
        <input
          v-model="keyword"
          type="search"
          placeholder="如：现金、资产负债、G0100、表一"
          autocomplete="off"
        />
      </label>
      <button type="submit" class="btn btn-primary" :disabled="searching || !keyword.trim()">
        {{ searching ? '搜索中…' : '搜索表样' }}
      </button>
    </form>

    <p v-if="error" class="feedback error">{{ error }}</p>
    <p v-else-if="searched && !result?.totalTemplates" class="feedback">
      未在表样名称、表头或指标名/项目名列中找到「{{ lastKeyword }}」
    </p>
    <p v-else-if="result?.totalTemplates" class="result-summary">
      共 {{ result.totalTemplates }} 张表样、{{ result.totalHits }} 处命中
      <span v-if="result.truncated">（结果已截断）</span>
    </p>

    <div v-if="result?.items?.length" class="fts-layout">
      <aside class="hit-list">
        <div
          v-for="item in result.items"
          :key="item.id"
          class="hit-group"
          :class="{ active: selectedId === item.id }"
        >
          <button type="button" class="hit-group-head" @click="selectTemplate(item)">
            <span class="code">{{ item.reportCode }}</span>
            <span class="title">{{ item.reportTitle }}</span>
            <span class="meta">版本 {{ item.versionLabel }} · {{ item.hitCount }} 处命中</span>
          </button>
          <ul v-if="selectedId === item.id" class="hit-rows">
            <li v-if="loadingHits" class="muted">加载命中…</li>
            <template v-else>
              <li v-for="(hit, i) in hitsForSelected" :key="i">
                <button type="button" class="hit-row" @click="selectHit(item, hit)">
                  <span class="pos">{{ hitPosLabel(hit) }}</span>
                  <span class="snippet">{{ hit.snippet }}</span>
                </button>
              </li>
              <li v-if="hitsTruncated" class="muted">… 还有更多命中</li>
            </template>
          </ul>
        </div>
      </aside>

      <div class="preview-pane">
        <p v-if="loadingDetail" class="muted">加载表样…</p>
        <template v-else-if="detail">
          <header class="preview-header">
            <h2>{{ detail.reportCode }} — {{ detail.reportTitle }}</h2>
            <p class="preview-meta">
              关键词「{{ lastKeyword }}」· 版本 {{ detail.versionLabel }}
              <span v-if="focusCell"> · 定位 R{{ focusCell.rowNum }}C{{ focusCell.colNum }}</span>
            </p>
            <p class="preview-hint">点击指标名称可查看对应填报说明</p>
          </header>
          <div class="preview-body">
            <FormTemplateMatrix
              ref="matrixRef"
              :matrix="detail.matrix"
              :merges="detail.merges"
              :highlight-cells="highlightCells"
              :focus-cell="focusCell"
              :selected-cell="selectedCell"
              enable-indicator-click
              @cell-click="onIndicatorCellClick"
            />

            <aside v-if="instructionOpen" class="instruction-drawer">
              <div class="instruction-header">
                <h3>填报说明</h3>
                <button type="button" class="btn-link" @click="clearInstruction">关闭</button>
              </div>

              <p v-if="loadingInstruction" class="muted">加载说明…</p>
              <p v-else-if="instructionError" class="instruction-error">{{ instructionError }}</p>
              <template v-else-if="instruction">
                <p class="instruction-meta">
                  {{ instruction.document?.docCode }}
                  <span v-if="instruction.document?.reportCode">
                    · 表样 {{ instruction.document.reportCode }}
                  </span>
                  · 指标 #{{ instruction.indicatorKey }}
                </p>
                <div class="instruction-title">{{ instruction.indicator?.text }}</div>
                <div
                  v-for="(body, idx) in instructionBodies"
                  :key="idx"
                  class="instruction-body"
                >
                  {{ body }}
                </div>
                <p v-if="!instructionBodies.length" class="muted">该指标下暂无正文</p>
                <router-link
                  v-if="instruction.document?.id"
                  class="btn-link instruction-link"
                  :to="{
                    name: 'documentDetail',
                    params: { id: instruction.document.id },
                    query: { indicator: instruction.indicatorKey },
                  }"
                >
                  在说明树中查看 →
                </router-link>
              </template>
            </aside>
          </div>
        </template>
        <p v-else class="muted empty-hint">点击左侧表样查看命中明细并预览</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import {
  getDocumentByReport,
  getDocumentIndicator,
  getFormTemplate,
  getFormTemplateSearchHits,
  searchFormTemplateCells,
} from '../api';
import FormTemplateMatrix from '../components/form-template/FormTemplateMatrix.vue';
import { resolveIndicatorKeyAtCell } from '../utils/formTemplateIndicator.js';

const keyword = ref('');
const lastKeyword = ref('');
const searching = ref(false);
const searched = ref(false);
const error = ref('');
const result = ref(null);

const selectedId = ref(null);
const detail = ref(null);
const loadingDetail = ref(false);
const loadingHits = ref(false);
const hitsForSelected = ref([]);
const hitsTruncated = ref(false);
const focusCell = ref(null);
const matrixRef = ref(null);
const selectedCell = ref(null);
const instruction = ref(null);
const instructionError = ref('');
const loadingInstruction = ref(false);

const instructionBodies = computed(() =>
  (instruction.value?.indicator?.children || [])
    .filter((c) => c.nodeKind === 'body')
    .map((c) => c.text)
);

const instructionOpen = computed(
  () =>
    Boolean(selectedCell.value) ||
    Boolean(instruction.value) ||
    Boolean(instructionError.value) ||
    loadingInstruction.value
);

const highlightCells = computed(() =>
  hitsForSelected.value
    .filter((h) => Number.isFinite(h.row) && Number.isFinite(h.col))
    .map((h) => ({ row: h.row, col: h.col }))
);

function hitPosLabel(hit) {
  if (hit.cellKind === 'template_title') return '表样名';
  if (hit.cellKind === 'template_code') return '表号';
  return `R${hit.rowNum}C${hit.colNum}`;
}

function clearInstruction() {
  selectedCell.value = null;
  instruction.value = null;
  instructionError.value = '';
}

async function onIndicatorCellClick({ row, col }) {
  selectedCell.value = { row, col };
  instruction.value = null;
  instructionError.value = '';

  const key = resolveIndicatorKeyAtCell(detail.value?.matrix, row, col);
  if (!key) {
    instructionError.value = '无法识别指标序号';
    return;
  }

  const reportCode = detail.value?.reportCode;
  if (!reportCode) {
    instructionError.value = '当前表样缺少表号';
    return;
  }

  loadingInstruction.value = true;
  try {
    let docMeta;
    try {
      docMeta = await getDocumentByReport(reportCode);
    } catch {
      instructionError.value = `未找到表样 ${reportCode} 对应的填报说明，请先导入并关联`;
      return;
    }

    try {
      instruction.value = await getDocumentIndicator(docMeta.id, key);
    } catch (e) {
      instructionError.value = e.message || `未找到指标 ${key} 的填报说明`;
    }
  } finally {
    loadingInstruction.value = false;
  }
}

async function loadHits(id) {
  if (!lastKeyword.value) return;
  loadingHits.value = true;
  try {
    const res = await getFormTemplateSearchHits(id, lastKeyword.value);
    hitsForSelected.value = res.hits || [];
    hitsTruncated.value = Boolean(res.hitsTruncated);
  } catch (e) {
    hitsForSelected.value = [];
    hitsTruncated.value = false;
    error.value = e.message || '加载命中失败';
  } finally {
    loadingHits.value = false;
  }
}

async function runSearch() {
  const q = keyword.value.trim();
  if (!q) return;

  searching.value = true;
  error.value = '';
  searched.value = false;
  result.value = null;
  detail.value = null;
  selectedId.value = null;
  hitsForSelected.value = [];
  hitsTruncated.value = false;
  focusCell.value = null;
  clearInstruction();

  try {
    result.value = await searchFormTemplateCells(q);
    lastKeyword.value = q;
    searched.value = true;
    if (result.value.items?.length) {
      await selectTemplate(result.value.items[0]);
    }
  } catch (e) {
    error.value = e.message || '搜索失败';
  } finally {
    searching.value = false;
  }
}

async function selectTemplate(item) {
  selectedId.value = item.id;
  focusCell.value = null;
  clearInstruction();
  await Promise.all([loadDetail(item.id), loadHits(item.id)]);
}

async function selectHit(item, hit) {
  selectedId.value = item.id;
  focusCell.value =
    hit && Number.isFinite(hit.row) && Number.isFinite(hit.col)
      ? { row: hit.row, col: hit.col, rowNum: hit.rowNum, colNum: hit.colNum }
      : null;
  if (detail.value?.id !== item.id) {
    await loadDetail(item.id);
  }
  if (!hitsForSelected.value.length) {
    await loadHits(item.id);
  }
  await nextTick();
  matrixRef.value?.scrollToCell?.(hit?.row, hit?.col);
}

async function loadDetail(id) {
  if (detail.value?.id === id) return;
  loadingDetail.value = true;
  clearInstruction();
  try {
    detail.value = await getFormTemplate(id);
  } catch (e) {
    detail.value = null;
    error.value = e.message || '加载表样失败';
  } finally {
    loadingDetail.value = false;
  }
}
</script>

<style scoped>
.fts-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  height: 100%;
}

.test-banner {
  padding: 6px 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.search-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
}

.search-field {
  flex: 1;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-field input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.result-summary {
  font-size: 13px;
  color: var(--text-secondary);
}

.fts-layout {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.hit-list {
  width: 220px;
  flex-shrink: 0;
  overflow: auto;
  max-height: calc(100vh - var(--header-h) - 130px);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
}

.hit-group {
  border-bottom: 1px solid var(--border);
}

.hit-group.active .hit-group-head {
  background: #fff;
}

.hit-group-head {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hit-group-head:hover {
  background: var(--bg-hover);
}

.hit-group-head .code {
  font-weight: 600;
  font-size: 13px;
}

.hit-group-head .title {
  font-size: 12px;
  color: var(--text-secondary);
}

.hit-group-head .meta {
  font-size: 11px;
  color: var(--text-muted);
}

.hit-rows {
  list-style: none;
  padding: 0 8px 8px;
}

.hit-row {
  width: 100%;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  text-align: left;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}

.hit-row:hover {
  background: var(--bg-hover);
}

.hit-row .pos {
  flex-shrink: 0;
  color: var(--accent-blue);
  font-family: ui-monospace, monospace;
  font-size: 11px;
}

.hit-row .snippet {
  color: var(--text);
  line-height: 1.4;
}

.preview-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.preview-header h2 {
  font-size: 16px;
}

.preview-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.preview-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.preview-body {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.preview-body :deep(.form-template-matrix-wrap) {
  width: 100%;
  max-height: calc(100vh - var(--header-h) - 150px);
}

.instruction-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(360px, 42%);
  z-index: 5;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
  box-shadow: -8px 0 24px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 12px 14px;
}

.instruction-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.instruction-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.instruction-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.instruction-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  line-height: 1.45;
}

.instruction-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 10px;
}

.instruction-error {
  font-size: 13px;
  color: #b91c1c;
  line-height: 1.5;
}

.instruction-link {
  margin-top: 8px;
  font-size: 12px;
}

.muted {
  color: var(--text-muted);
  font-size: 12px;
  padding: 4px 8px;
}

.empty-hint {
  padding: 24px;
}
</style>
