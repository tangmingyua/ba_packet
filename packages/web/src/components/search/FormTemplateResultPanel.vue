<template>
  <section class="form-template-result-panel">
    <p v-if="loadError" class="feedback error">{{ loadError }}</p>
    <p v-else-if="searched && !listItems.length" class="message muted">{{ emptyText }}</p>
    <p v-else-if="searchMode && resultSummary" class="result-summary">{{ resultSummary }}</p>

    <div v-if="listItems.length" class="form-template-layout">
      <aside class="form-template-list">
        <div class="list-header">
          <div class="list-header-left">
            <button v-if="showBack" type="button" class="btn" @click="emit('back')">返回目录</button>
            <h3>表样</h3>
          </div>
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
              <span class="sheet-row">
                <span class="sheet-name">{{ listSheetLabel(item) }}</span>
                <span v-if="searchMode && item.hitCount != null" class="hit-count">{{
                  item.hitCount
                }}</span>
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
              <h2>{{ formTemplateDisplayTitle(detail) }}</h2>
              <p class="preview-meta">
                版本 {{ detail.versionLabel }} · {{ detail.rowCount }} 行 × {{ detail.colCount }} 列
                <span v-if="searchMode && keyword"> · 关键词「{{ keyword }}」</span>
                <span v-if="focusCell"> · 定位 R{{ focusCell.rowNum }}C{{ focusCell.colNum }}</span>
              </p>
              <p class="preview-hint">点击指标名称查看填报说明；若存在匹配的主指标校验规则，将一并展示</p>
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
              @cell-click="handleIndicatorCellClick"
            />

            <FormTemplateInstructionDrawer
              :open="instructionOpen"
              :loading="loadingInstruction"
              :error="instructionError"
              :instruction="instruction"
              :bodies="instructionBodies"
              :testify-rules="testifyRules"
              @close="clearInstruction"
            />
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
  getFormTemplate,
  getFormTemplateSearchHits,
  listFormTemplates,
  searchFormTemplateCells,
} from '../../api';
import FormTemplateMatrix from '../form-template/FormTemplateMatrix.vue';
import FormTemplateInstructionDrawer from '../form-template/FormTemplateInstructionDrawer.vue';
import { useFormTemplateInstructionPanel } from '../../composables/useFormTemplateInstructionPanel.js';
import { formTemplateDisplayTitle, formTemplateListSheetLabel } from '../../utils/formTemplateListDisplay.js';
import { formTemplateReportCodesMatch } from '../../../../server/src/utils/form-template-report-code.js';
import { compareVersionLabelsDesc } from '../../utils/versionSort.js';

const props = defineProps({
  keyword: { type: String, default: '' },
  moduleCode: { type: String, default: '' },
  subtypeCode: { type: String, default: '' },
  emptyText: { type: String, default: '未找到匹配表样' },
  showBack: { type: Boolean, default: false },
  focusReportCode: { type: String, default: '' },
});

const emit = defineEmits(['back']);

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
const {
  selectedCell,
  instruction,
  instructionError,
  loadingInstruction,
  testifyRules,
  instructionBodies,
  instructionOpen,
  clearInstruction,
  onIndicatorCellClick,
} = useFormTemplateInstructionPanel();

const searchMode = computed(() => Boolean(props.keyword.trim()));

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

function listSheetLabel(item) {
  return formTemplateListSheetLabel(item, {
    moduleCode: props.moduleCode,
    subtypeCode: props.subtypeCode,
  });
}

async function handleIndicatorCellClick({ row, col }) {
  await onIndicatorCellClick({
    matrix: detail.value?.matrix,
    reportCode: detail.value?.reportCode,
    versionLabel: detail.value?.versionLabel,
    row,
    col,
  });
}

function filterByModule(items) {
  const mod = props.moduleCode.trim();
  if (!mod) return items;
  return items.filter((item) => (item.moduleCode || '') === mod);
}

function pickLatestByReportCode(items, reportCode) {
  const code = String(reportCode || '').trim();
  if (!code) return null;
  const matched = items.filter((item) => formTemplateReportCodesMatch(item.reportCode, code));
  if (!matched.length) return null;
  return [...matched].sort((a, b) => compareVersionLabelsDesc(a.versionLabel, b.versionLabel))[0];
}

async function applyFocusOrSelectFirst() {
  const focus = String(props.focusReportCode || '').trim();
  if (focus) {
    let picked = pickLatestByReportCode(listItems.value, focus);
    if (!picked) {
      try {
        const res = await listFormTemplates({
          moduleCode: props.moduleCode.trim() || undefined,
          subtypeCode: props.subtypeCode.trim() || undefined,
        });
        picked = pickLatestByReportCode(res.items || [], focus);
        if (picked && !listItems.value.some((item) => item.id === picked.id)) {
          listItems.value = [picked, ...listItems.value];
        }
      } catch {
        picked = null;
      }
    }
    if (picked) {
      await selectTemplate(picked);
      return;
    }
  }
  if (listItems.value.length) {
    await selectTemplate(listItems.value[0]);
  }
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
      await applyFocusOrSelectFirst();
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
      await applyFocusOrSelectFirst();
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

watch(
  () => [props.keyword, props.moduleCode, props.subtypeCode, props.focusReportCode],
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

.list-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.list-header-left .btn {
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.2;
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
  display: block;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  text-align: left;
  color: inherit;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
}

.sheet-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.sheet-name {
  font-size: 12px;
  line-height: 1.4;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hit-count {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.template-item:hover {
  background: var(--bg-hover);
}

.template-item.active {
  background: #fff;
  border-color: var(--border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
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
