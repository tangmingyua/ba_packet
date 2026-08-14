<template>
  <section class="document-result-panel">
    <p v-if="loadError" class="feedback error">{{ loadError }}</p>
    <p v-else-if="searched && !listItems.length" class="message muted">{{ emptyText }}</p>
    <p v-else-if="searchMode && resultSummary" class="result-summary">{{ resultSummary }}</p>

    <div v-if="listItems.length" class="document-layout">
      <aside class="document-list">
        <div class="list-header">
          <h3>说明</h3>
          <span v-if="searchMode" class="list-meta">{{ listItems.length }} 份</span>
        </div>
        <ul class="document-items">
          <li v-for="item in listItems" :key="item.id">
            <button
              type="button"
              class="document-item"
              :class="{ active: selectedId === item.id }"
              @click="selectDocument(item)"
            >
              <span class="code">{{ item.docCode }}</span>
              <span class="report">{{ item.reportCode || '未关联表样' }}</span>
              <span class="title">{{ item.docTitle }}</span>
              <span class="meta">
                <template v-if="searchMode && item.hitCount">{{ item.hitCount }} 处命中 · </template>
                {{ item.nodeCount ?? 0 }} 节点
              </span>
            </button>
            <ul v-if="searchMode && selectedId === item.id && hitsForSelected.length" class="hit-rows">
              <li v-if="loadingHits" class="muted">加载命中…</li>
              <li v-for="(hit, i) in hitsForSelected" v-else :key="i">
                <button type="button" class="hit-row" @click="selectHit(item, hit)">
                  <span class="pos">{{ hitKindLabel(hit) }}</span>
                  <span class="snippet">{{ hit.snippet }}</span>
                </button>
              </li>
              <li v-if="hitsTruncated" class="muted">… 还有更多命中</li>
            </ul>
          </li>
        </ul>
      </aside>

      <div class="document-preview">
        <p v-if="loadingDetail" class="muted">加载说明…</p>
        <template v-else-if="detail">
          <header class="preview-header">
            <div>
              <h2>{{ detail.docTitle || detail.docCode }}</h2>
              <p class="preview-meta">
                {{ detail.nodeCount ?? 0 }} 节点
                <span v-if="detail.reportCode"> · 表样 {{ detail.reportCode }}</span>
                <span v-if="searchMode && keyword"> · 关键词「{{ keyword }}」</span>
                <span v-if="focusNodeId"> · 已定位节点 #{{ focusNodeId }}</span>
                <span v-else-if="focusIndicatorKey"> · 已定位指标 #{{ focusIndicatorKey }}</span>
              </p>
            </div>
          </header>

          <DocumentTree
            :tree="detail.tree"
            :highlight-node-id="focusNodeId"
            :highlight-indicator-key="focusIndicatorKey"
          />
        </template>
        <p v-else class="muted empty-hint">请从左侧选择说明</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import {
  getDocument,
  getDocumentSearchHitsApi,
  listDocuments,
  searchDocumentsApi,
} from '../../api';
import DocumentTree from '../document/DocumentTree.vue';

const KIND_LABELS = {
  part: '部分',
  general_item: '条目',
  section: '分节',
  indicator: '指标',
  body: '正文',
  heading: '标题',
  paragraph: '段落',
  placeholder: '表样',
  document_code: '代号',
  document_title: '文档标题',
};

const props = defineProps({
  keyword: { type: String, default: '' },
  moduleCode: { type: String, default: '' },
  subtypeCode: { type: String, default: '' },
  emptyText: { type: String, default: '未找到匹配说明' },
});

const listItems = ref([]);
const detail = ref(null);
const selectedId = ref(null);
const loadingDetail = ref(false);
const loadError = ref('');
const searched = ref(false);
const searchResult = ref(null);

const loadingHits = ref(false);
const hitsForSelected = ref([]);
const hitsTruncated = ref(false);
const focusNodeId = ref(null);
const focusIndicatorKey = ref('');

const searchMode = computed(() => Boolean(props.keyword.trim()));

const resultSummary = computed(() => {
  if (!searchResult.value) return '';
  const { totalDocuments, totalHits, truncated } = searchResult.value;
  let text = `共 ${totalDocuments} 份说明、${totalHits} 处命中`;
  if (truncated) text += '（结果已截断）';
  return text;
});

function hitKindLabel(hit) {
  if (hit.nodeKind === 'indicator' && hit.indicatorKey) return `#${hit.indicatorKey}`;
  if (hit.nodeKind === 'indicator' && hit.indicatorNo != null) return `#${hit.indicatorNo}`;
  return KIND_LABELS[hit.nodeKind] || hit.nodeKind || '节点';
}

function listQueryOptions() {
  return {
    moduleCode: props.moduleCode.trim() || undefined,
    subtypeCode: props.subtypeCode.trim() || undefined,
  };
}

async function loadBrowseList() {
  loadError.value = '';
  searched.value = true;
  selectedId.value = null;
  detail.value = null;
  hitsForSelected.value = [];
  hitsTruncated.value = false;
  focusNodeId.value = null;
  focusIndicatorKey.value = '';
  searchResult.value = null;

  try {
    const res = await listDocuments(listQueryOptions());
    listItems.value = res.items || [];
    if (listItems.value.length) {
      await selectDocument(listItems.value[0]);
    }
  } catch (e) {
    loadError.value = e.message || '加载填报说明列表失败';
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
  focusNodeId.value = null;
  focusIndicatorKey.value = '';

  try {
    searchResult.value = await searchDocumentsApi(props.keyword.trim(), listQueryOptions());
    listItems.value = searchResult.value.items || [];
    if (listItems.value.length) {
      await selectDocument(listItems.value[0]);
    }
  } catch (e) {
    loadError.value = e.message || '搜索填报说明失败';
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
    const res = await getDocumentSearchHitsApi(id, props.keyword.trim());
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
  if (detail.value?.id === id) return;
  loadingDetail.value = true;
  try {
    detail.value = await getDocument(id);
  } catch (e) {
    detail.value = null;
    loadError.value = e.message || '加载说明失败';
  } finally {
    loadingDetail.value = false;
  }
}

async function selectDocument(item) {
  selectedId.value = item.id;
  focusNodeId.value = null;
  focusIndicatorKey.value = '';
  await Promise.all([loadDetail(item.id), loadHits(item.id)]);
}

async function selectHit(item, hit) {
  selectedId.value = item.id;
  if (detail.value?.id !== item.id) {
    await loadDetail(item.id);
  }
  focusNodeId.value = null;
  focusIndicatorKey.value = '';
  await nextTick();
  const nodeId = hit?.nodeId != null ? Number(hit.nodeId) : null;
  focusNodeId.value = Number.isFinite(nodeId) && nodeId > 0 ? nodeId : null;
  focusIndicatorKey.value =
    hit?.nodeKind === 'indicator'
      ? String(hit.indicatorKey || hit.indicatorNo || '')
      : '';
  if (!hitsForSelected.value.length) {
    await loadHits(item.id);
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
.document-result-panel {
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

.document-layout {
  display: flex;
  gap: 8px;
  flex: 1 1 0;
  min-height: 0;
  align-items: stretch;
}

.document-list {
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

.document-items {
  list-style: none;
  overflow: auto;
  flex: 1;
  padding: 6px;
  margin: 0;
}

.document-item {
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

.document-item:hover {
  background: var(--bg-hover);
}

.document-item.active {
  background: #fff;
  border-color: var(--border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.document-item .code {
  font-weight: 600;
  font-size: 12px;
}

.document-item .report {
  font-size: 11px;
  color: var(--text-muted);
}

.document-item .title {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.document-item .meta {
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
  min-width: 32px;
}

.hit-row .snippet {
  color: var(--text);
  line-height: 1.4;
}

.document-preview {
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

.preview-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

.document-preview :deep(.document-tree-wrap) {
  flex: 1;
  min-height: 0;
  overflow: auto;
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
  font-size: 13px;
}
</style>
