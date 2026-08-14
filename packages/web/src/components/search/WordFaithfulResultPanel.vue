<template>
  <section class="word-faithful-result-panel">
    <p v-if="loadError" class="feedback error">{{ loadError }}</p>
    <p v-else-if="searched && !listItems.length" class="message muted">{{ emptyText }}</p>
    <p v-else-if="searchMode && resultSummary" class="result-summary">{{ resultSummary }}</p>

    <div v-if="listItems.length" class="wf-layout">
      <aside class="version-list">
        <div class="list-header">
          <h3>版本</h3>
          <span v-if="searchMode" class="list-meta">{{ listItems.length }} 个</span>
        </div>
        <ul class="version-items">
          <li v-for="item in listItems" :key="item.id">
            <button
              type="button"
              class="version-item"
              :class="{ active: selectedId === item.id }"
              @click="selectVersion(item)"
            >
              <span class="title">{{ item.docTitle || item.docCode }}</span>
              <span class="version-label">{{ item.versionLabel || '—' }}</span>
            </button>
            <ul v-if="searchMode && selectedId === item.id && hitsForSelected.length" class="hit-rows">
              <li v-if="loadingHits" class="muted">加载命中…</li>
              <li v-for="(hit, i) in hitsForSelected" v-else :key="i">
                <button
                  type="button"
                  class="hit-row"
                  :class="{ active: activeHitIndex === i }"
                  @click="selectHit(item, hit, i)"
                >
                  <span class="pos">{{ hitKindLabel(hit) }}</span>
                  <span class="snippet">{{ hit.snippet }}</span>
                </button>
              </li>
              <li v-if="hitsTruncated" class="muted">… 还有更多命中</li>
            </ul>
          </li>
        </ul>
      </aside>

      <div class="preview-pane">
        <p v-if="loadingDetail" class="muted">加载 Word…</p>
        <template v-else-if="detail">
          <header class="preview-header">
            <div>
              <h2>{{ detail.docTitle || detail.docCode }}</h2>
              <p class="preview-meta">
                版本 {{ detail.versionLabel || '—' }}
                <span v-if="searchMode && keyword"> · 关键词「{{ keyword }}」</span>
                <span v-if="findTotal > 0"> · 预览中 {{ findActiveIndex + 1 }}/{{ findTotal }} 处</span>
              </p>
            </div>
            <div v-if="searchMode && findTotal > 1" class="find-nav">
              <button type="button" class="btn-sm" @click="stepFind(-1)">上一处</button>
              <button type="button" class="btn-sm" @click="stepFind(1)">下一处</button>
            </div>
          </header>

          <p v-if="previewNotice" class="feedback">{{ previewNotice }}</p>
          <p v-if="rendering" class="muted">正在渲染 Word…</p>
          <p v-if="findMessage" class="find-message muted">{{ findMessage }}</p>

          <div class="wf-preview-shell">
            <div
              v-show="!useFallbackHtml"
              ref="previewRef"
              class="wf-preview"
              @click.capture="preventPreviewHashLinkNavigation"
            />
            <div
              v-show="useFallbackHtml"
              ref="fallbackRef"
              class="wf-preview wf-fallback"
              v-html="fallbackHtml"
              @click.capture="preventPreviewHashLinkNavigation"
            />
            <WordPreviewZoomBar v-if="!rendering" v-model="previewZoom" />
          </div>
        </template>
        <p v-else class="muted empty-hint">请从左侧选择版本</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { renderAsync } from 'docx-preview';
import {
  fetchWordFaithfulFile,
  getWordFaithfulDocument,
  getWordFaithfulSearchHitsApi,
  listWordFaithfulDocuments,
  searchWordFaithfulApi,
} from '../../api';
import {
  applyFindHighlight,
  applyPreviewZoom,
  clearFindHighlights,
  PREVIEW_ZOOM,
  preventPreviewHashLinkNavigation,
  resolveMatchIndexForHit,
} from '../../utils/wordFaithfulPreview.js';
import WordPreviewZoomBar from './WordPreviewZoomBar.vue';

const props = defineProps({
  keyword: { type: String, default: '' },
  moduleCode: { type: String, default: '' },
  subtypeCode: { type: String, default: '' },
  defaultVersionLabel: { type: String, default: '' },
  emptyText: { type: String, default: '未找到匹配 Word 文档' },
});

const listItems = ref([]);
const detail = ref(null);
const selectedId = ref(null);
const loadingDetail = ref(false);
const rendering = ref(false);
const loadError = ref('');
const searched = ref(false);
const searchResult = ref(null);
const previewNotice = ref('');
const useFallbackHtml = ref(false);
const fallbackHtml = ref('');
const previewRef = ref(null);
const fallbackRef = ref(null);

const loadingHits = ref(false);
const hitsForSelected = ref([]);
const hitsTruncated = ref(false);
const findTotal = ref(0);
const findActiveIndex = ref(0);
const findMessage = ref('');
const activeHitIndex = ref(-1);
const previewZoom = ref(PREVIEW_ZOOM.default);

const searchMode = computed(() => Boolean(props.keyword.trim()));

const resultSummary = computed(() => {
  if (!searchResult.value) return '';
  const { totalDocuments, totalHits, truncated } = searchResult.value;
  let text = `共 ${totalDocuments} 个版本、${totalHits} 处命中`;
  if (truncated) text += '（结果已截断）';
  return text;
});

function hitKindLabel(hit) {
  if (hit.blockKind === 'document_code') return '代号';
  if (hit.blockKind === 'document_title') return '标题';
  if (hit.blockKind === 'table_cell') {
    const r = hit.rowIndex == null ? '?' : hit.rowIndex + 1;
    const c = hit.colIndex == null ? '?' : hit.colIndex + 1;
    return `表${(hit.tableIndex ?? 0) + 1} R${r}C${c}`;
  }
  if (hit.blockKind === 'heading') return '标题';
  return '段落';
}

function listQueryOptions() {
  return {
    moduleCode: props.moduleCode.trim() || undefined,
    subtypeCode: props.subtypeCode.trim() || undefined,
  };
}

function pickInitialItem(items) {
  if (!items.length) return null;
  const preferred = props.defaultVersionLabel.trim();
  if (preferred) {
    const found = items.find((item) => item.versionLabel === preferred);
    if (found) return found;
  }
  return items[0];
}

function activePreviewRoot() {
  if (useFallbackHtml.value) return fallbackRef.value;
  return previewRef.value;
}

function resetFindState() {
  findTotal.value = 0;
  findActiveIndex.value = 0;
  findMessage.value = '';
  activeHitIndex.value = -1;
  const root = activePreviewRoot();
  if (root) clearFindHighlights(root);
}

function scrollContainerEl() {
  return previewRef.value || fallbackRef.value;
}

function syncPreviewZoom() {
  applyPreviewZoom(activePreviewRoot(), previewZoom.value);
}

function resetPreviewZoom() {
  previewZoom.value = PREVIEW_ZOOM.default;
  syncPreviewZoom();
}

function applyFindAtIndex(index, { hitIndex = -1 } = {}) {
  const root = activePreviewRoot();
  const q = props.keyword.trim();
  if (!root || !q) {
    resetFindState();
    return;
  }

  const result = applyFindHighlight(root, q, index, scrollContainerEl());
  findTotal.value = result.total;
  findActiveIndex.value = result.activeIndex;
  activeHitIndex.value = hitIndex;

  if (result.total === 0) {
    findMessage.value = `预览中未找到「${q}」（索引块有命中时，可能是版式与索引文本不一致）`;
  } else {
    findMessage.value = '';
  }
}

async function renderDocxPreview(id) {
  const container = previewRef.value;
  if (!container) return;

  rendering.value = true;
  previewNotice.value = '';
  useFallbackHtml.value = false;
  container.innerHTML = '';

  try {
    const arrayBuffer = await fetchWordFaithfulFile(id);

    await renderAsync(arrayBuffer, container, container, {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
    });

    if (!container.querySelector('.docx-wrapper') && !container.childElementCount) {
      throw new Error('Word 渲染结果为空');
    }
  } catch (e) {
    previewNotice.value =
      e.message?.includes('重新上传') || !detail.value?.hasDocxFile
        ? '该文档为旧版导入，未保存原始 Word。请在资料导入中重新上传以启用高保真预览。'
        : `Word 渲染失败：${e.message || '未知错误'}。已回退为文本预览。`;
    useFallbackHtml.value = true;
    fallbackHtml.value = detail.value?.previewHtml || '';
  } finally {
    rendering.value = false;
    await nextTick();
    syncPreviewZoom();
  }
}

async function loadBrowseList() {
  loadError.value = '';
  searched.value = true;
  selectedId.value = null;
  detail.value = null;
  hitsForSelected.value = [];
  hitsTruncated.value = false;
  resetFindState();
  searchResult.value = null;

  try {
    const res = await listWordFaithfulDocuments(listQueryOptions());
    listItems.value = res.items || [];
    const initial = pickInitialItem(listItems.value);
    if (initial) {
      await selectVersion(initial);
    }
  } catch (e) {
    loadError.value = e.message || '加载 Word 版本列表失败';
    listItems.value = [];
  }
}

async function loadSearchList() {
  loadError.value = '';
  searched.value = true;
  selectedId.value = null;
  detail.value = null;
  hitsForSelected.value = [];
  hitsTruncated.value = false;
  resetFindState();

  try {
    searchResult.value = await searchWordFaithfulApi(props.keyword.trim(), listQueryOptions());
    listItems.value = searchResult.value.items || [];
    const initial = pickInitialItem(listItems.value);
    if (initial) {
      await selectVersion(initial);
    }
  } catch (e) {
    loadError.value = e.message || '搜索 Word 文档失败';
    listItems.value = [];
    searchResult.value = null;
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
    const res = await getWordFaithfulSearchHitsApi(id, props.keyword.trim());
    hitsForSelected.value = res.hits || [];
    hitsTruncated.value = Boolean(res.hitsTruncated);
  } catch {
    hitsForSelected.value = [];
    hitsTruncated.value = false;
  } finally {
    loadingHits.value = false;
  }
}

async function loadDetail(id) {
  loadingDetail.value = true;
  resetFindState();
  resetPreviewZoom();
  useFallbackHtml.value = false;
  fallbackHtml.value = '';
  try {
    detail.value = await getWordFaithfulDocument(id);
  } catch (e) {
    detail.value = null;
    loadError.value = e.message || '加载 Word 文档失败';
  } finally {
    loadingDetail.value = false;
  }
}

async function selectVersion(item) {
  selectedId.value = item.id;
  resetFindState();

  if (detail.value?.id !== item.id) {
    await loadDetail(item.id);
    await nextTick();
    await renderDocxPreview(item.id);
  }

  await loadHits(item.id);

  if (searchMode.value && props.keyword.trim()) {
    await nextTick();
    applyFindAtIndex(0);
  }
}

async function selectHit(item, hit, hitIndex) {
  if (selectedId.value !== item.id || detail.value?.id !== item.id) {
    await selectVersion(item);
  }
  await nextTick();
  const root = activePreviewRoot();
  const q = props.keyword.trim();
  if (!root || !q) return;

  if (!hitsForSelected.value.length) {
    await loadHits(item.id);
  }

  clearFindHighlights(root);
  const matchIndex = resolveMatchIndexForHit(root, q, hit, hitIndex);
  applyFindAtIndex(matchIndex, { hitIndex });
}

function stepFind(delta) {
  if (findTotal.value <= 0) return;
  const next = (findActiveIndex.value + delta + findTotal.value) % findTotal.value;
  activeHitIndex.value = -1;
  applyFindAtIndex(next);
}

watch(
  () => [props.keyword, props.moduleCode, props.subtypeCode, props.defaultVersionLabel],
  () => {
    reload();
  },
  { immediate: true }
);

watch(previewZoom, () => {
  syncPreviewZoom();
});

watch(useFallbackHtml, async () => {
  await nextTick();
  syncPreviewZoom();
});
</script>

<style scoped>
.word-faithful-result-panel {
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

.wf-layout {
  display: flex;
  gap: 8px;
  flex: 1 1 0;
  min-height: 0;
  align-items: stretch;
}

.version-list {
  width: 220px;
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

.version-items {
  list-style: none;
  overflow: auto;
  flex: 1;
  padding: 6px;
  margin: 0;
}

.version-item {
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

.version-item:hover {
  background: var(--bg-hover);
}

.version-item.active {
  background: #fff;
  border-color: var(--border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.version-item .title {
  font-weight: 600;
  font-size: 12px;
  color: var(--text);
  line-height: 1.4;
  word-break: break-all;
}

.version-item .version-label {
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

.hit-row:hover,
.hit-row.active {
  background: var(--bg-hover);
}

.hit-row .pos {
  flex-shrink: 0;
  color: var(--accent-blue);
  font-family: ui-monospace, monospace;
  font-size: 10px;
  min-width: 32px;
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
  gap: 6px;
  min-height: 0;
}

.preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.preview-header h2 {
  font-size: 15px;
  margin: 0 0 4px;
  line-height: 1.4;
  word-break: break-all;
}

.preview-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

.find-nav {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn-sm {
  font-size: 11px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  cursor: pointer;
}

.btn-sm:hover {
  background: var(--bg-hover);
}

.find-message {
  font-size: 12px;
  margin: 0;
}

.wf-preview-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.wf-preview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  background: #fff;
}

.wf-preview :deep(.docx-wrapper) {
  background: #fff;
  padding: 12px;
}

.wf-preview :deep(mark.wf-find-match),
.wf-fallback :deep(mark.wf-find-match) {
  background: #fef08a;
  padding: 0;
}

.wf-preview :deep(mark.wf-find-active),
.wf-fallback :deep(mark.wf-find-active) {
  background: #fb923c;
  outline: 2px solid #ea580c;
  padding: 0;
}

.wf-fallback :deep(.wf-heading) {
  font-weight: 700;
  margin: 1rem 0 0.5rem;
}

.wf-fallback :deep(.wf-paragraph) {
  margin: 0.35rem 0;
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
  font-size: 13px;
}

.feedback {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}
</style>
