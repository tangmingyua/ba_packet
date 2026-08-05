<template>
  <section class="form-template-result-panel">
    <p v-if="loadError" class="feedback error">{{ loadError }}</p>
    <p v-else-if="searched && !listItems.length" class="message muted">{{ emptyText }}</p>
    <p v-else-if="searchMode && resultSummary" class="result-summary">{{ resultSummary }}</p>

    <div v-if="listItems.length" class="form-template-layout">
      <aside class="form-template-list">
        <div class="list-header">
          <h3>表样</h3>
          <span v-if="searchMode" class="list-meta">{{ listItems.length }} 张</span>
        </div>
        <ul class="template-items">
          <li v-for="item in listItems" :key="item.id">
            <button
              type="button"
              class="template-item"
              :class="{ active: selectedId === item.id }"
              @click="selectTemplate(item)"
            >
              <span class="code">{{ item.reportCode }}</span>
              <span class="title">{{ item.reportTitle || item.sheetName }}</span>
              <span v-if="searchMode && item.hitCount" class="meta">
                {{ item.hitCount }} 处命中
              </span>
            </button>
            <ul v-if="searchMode && selectedId === item.id && hitsForSelected.length" class="hit-rows">
              <li v-if="loadingHits" class="muted">加载命中…</li>
              <li v-for="(hit, i) in hitsForSelected" v-else :key="i">
                <button type="button" class="hit-row" @click="selectHit(item, hit)">
                  <span class="pos">{{ hitPosLabel(hit) }}</span>
                  <span class="snippet">{{ hit.snippet }}</span>
                </button>
              </li>
              <li v-if="hitsTruncated" class="muted">… 还有更多命中</li>
            </ul>
          </li>
        </ul>
      </aside>

      <div class="form-template-preview">
        <p v-if="loadingDetail" class="muted">加载表样…</p>
        <template v-else-if="detail">
          <header class="preview-header">
            <div>
              <h2>{{ detail.reportCode }} — {{ detail.reportTitle }}</h2>
              <p class="preview-meta">
                版本 {{ detail.versionLabel }} · Sheet {{ detail.sheetName }} ·
                {{ detail.rowCount }} 行 × {{ detail.colCount }} 列
                <span v-if="searchMode && keyword"> · 关键词「{{ keyword }}」</span>
                <span v-if="focusCell"> · 定位 R{{ focusCell.rowNum }}C{{ focusCell.colNum }}</span>
              </p>
              <p class="preview-hint">点击指标名称查看对应填报说明</p>
            </div>
          </header>

          <div class="preview-body">
            <FormTemplateMatrix
              ref="matrixRef"
              :matrix="detail.matrix"
              :merges="detail.merges"
              :layout="detail.layout"
              :highlight-cells="highlightCells"
              :focus-cell="focusCell"
              :selected-cell="selectedCell"
              :enable-cell-full-text="props.moduleCode !== '1104'"
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
              </template>
            </aside>
          </div>
        </template>
        <p v-else class="muted empty-hint">请从左侧选择表样</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import {
  getDocumentByReport,
  getDocumentIndicator,
  getFormTemplate,
  getFormTemplateSearchHits,
  listFormTemplates,
  searchFormTemplateCells,
} from '../../api';
import FormTemplateMatrix from '../form-template/FormTemplateMatrix.vue';
import { resolveIndicatorKeyAtCell } from '../../utils/formTemplateIndicator.js';

const props = defineProps({
  keyword: { type: String, default: '' },
  moduleCode: { type: String, default: '' },
  subtypeCode: { type: String, default: '' },
  emptyText: { type: String, default: '未找到匹配表样' },
});

const listItems = ref([]);
const detail = ref(null);
const selectedId = ref(null);
const loadingList = ref(false);
const loadingDetail = ref(false);
const loadError = ref('');
const searched = ref(false);
const searchResult = ref(null);

const loadingHits = ref(false);
const hitsForSelected = ref([]);
const hitsTruncated = ref(false);
const focusCell = ref(null);
const matrixRef = ref(null);
const selectedCell = ref(null);
const instruction = ref(null);
const instructionError = ref('');
const loadingInstruction = ref(false);

const searchMode = computed(() => Boolean(props.keyword.trim()));

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

const resultSummary = computed(() => {
  if (!searchResult.value) return '';
  const { totalTemplates, totalHits, truncated } = searchResult.value;
  let text = `共 ${totalTemplates} 张表样、${totalHits} 处命中`;
  if (truncated) text += '（结果已截断）';
  return text;
});

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

function filterByModule(items) {
  const mod = props.moduleCode.trim();
  if (!mod) return items;
  return items.filter((item) => (item.moduleCode || '') === mod);
}

async function loadBrowseList() {
  loadingList.value = true;
  loadError.value = '';
  searched.value = true;
  try {
    const res = await listFormTemplates({
      moduleCode: props.moduleCode.trim() || undefined,
      subtypeCode: props.subtypeCode.trim() || undefined,
    });
    listItems.value = res.items || [];
    searchResult.value = null;
    if (listItems.value.length) {
      await selectTemplate(listItems.value[0]);
    } else {
      selectedId.value = null;
      detail.value = null;
      clearInstruction();
    }
  } catch (e) {
    loadError.value = e.message || '加载表样列表失败';
    listItems.value = [];
  } finally {
    loadingList.value = false;
  }
}

async function loadSearchList() {
  loadingList.value = true;
  loadError.value = '';
  searched.value = true;
  selectedId.value = null;
  detail.value = null;
  hitsForSelected.value = [];
  hitsTruncated.value = false;
  focusCell.value = null;
  clearInstruction();

  try {
    searchResult.value = await searchFormTemplateCells(props.keyword.trim(), {
      moduleCode: props.moduleCode.trim() || undefined,
      subtypeCode: props.subtypeCode.trim() || undefined,
    });
    listItems.value = searchResult.value.items || [];
    if (listItems.value.length) {
      await selectTemplate(listItems.value[0]);
    }
  } catch (e) {
    loadError.value = e.message || '搜索表样失败';
    listItems.value = [];
    searchResult.value = null;
  } finally {
    loadingList.value = false;
  }
}

async function reload() {
  if (searchMode.value) {
    await loadSearchList();
  } else {
    await loadBrowseList();
  }
}

async function loadHits(id) {
  if (!searchMode.value) {
    hitsForSelected.value = [];
    hitsTruncated.value = false;
    return;
  }
  loadingHits.value = true;
  try {
    const item = listItems.value.find((x) => x.id === id);
    const hitsLimit = item?.hitCount
      ? Math.min(Math.max(Number(item.hitCount), 30), 2000)
      : 500;
    const res = await getFormTemplateSearchHits(id, props.keyword.trim(), { hitsLimit });
    hitsForSelected.value = res.hits || [];
    hitsTruncated.value = Boolean(res.hitsTruncated);
  } catch (e) {
    hitsForSelected.value = [];
    hitsTruncated.value = false;
  } finally {
    loadingHits.value = false;
  }
}

async function loadDetail(id) {
  if (detail.value?.id === id) return;
  loadingDetail.value = true;
  clearInstruction();
  try {
    detail.value = await getFormTemplate(id);
  } catch (e) {
    detail.value = null;
    loadError.value = e.message || '加载表样失败';
  } finally {
    loadingDetail.value = false;
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

watch(
  () => [props.keyword, props.moduleCode, props.subtypeCode],
  () => {
    reload();
  },
  { immediate: true }
);
</script>

<style scoped>
.form-template-result-panel {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-summary {
  font-size: 12px;
  color: var(--text-secondary);
  flex: 0 0 auto;
  margin: 0;
}

.form-template-layout {
  display: flex;
  gap: 8px;
  flex: 1 1 0;
  min-height: 0;
  align-items: stretch;
}

.form-template-list {
  width: 180px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.list-header h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
}

.list-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.template-items {
  list-style: none;
  overflow: auto;
  flex: 1;
  padding: 6px;
  margin: 0;
}

.template-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  text-align: left;
  color: inherit;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
}

.template-item:hover {
  background: var(--bg-hover);
}

.template-item.active {
  background: #fff;
  border-color: var(--border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.template-item .code {
  font-weight: 600;
  font-size: 12px;
}

.template-item .title {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.template-item .meta {
  font-size: 11px;
  color: var(--text-muted);
}

.hit-rows {
  list-style: none;
  padding: 0 4px 6px 6px;
  margin: 0;
}

.hit-row {
  width: 100%;
  display: flex;
  gap: 6px;
  align-items: flex-start;
  text-align: left;
  padding: 4px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font-size: 11px;
}

.hit-row:hover {
  background: var(--bg-hover);
}

.hit-row .pos {
  flex-shrink: 0;
  color: var(--accent-blue);
  font-family: ui-monospace, monospace;
  font-size: 10px;
}

.hit-row .snippet {
  color: var(--text);
  line-height: 1.4;
}

.form-template-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.preview-header h2 {
  font-size: 15px;
  margin: 0 0 4px;
}

.preview-meta,
.preview-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

.preview-hint {
  margin-top: 4px;
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
  height: 100%;
  max-height: none;
}

.instruction-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(320px, 42%);
  z-index: 5;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
  box-shadow: -8px 0 24px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 8px 10px;
}

.instruction-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.instruction-header h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
}

.instruction-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.instruction-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  line-height: 1.45;
}

.instruction-body {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 8px;
}

.instruction-error {
  font-size: 12px;
  color: #b91c1c;
  line-height: 1.5;
}

.muted {
  color: var(--text-muted);
  font-size: 12px;
  padding: 10px;
}

.empty-hint {
  padding: 20px;
}

.feedback.error {
  color: #b91c1c;
  font-size: 12px;
}
</style>
