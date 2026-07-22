<template>
  <section class="doc-search-page">
    <p class="hint">
      搜索 1104 填报说明中的<strong>文档代号/标题</strong>与<strong>部分、指标、正文</strong>等节点正文；英文不区分大小写；至少 1 个字即可。
    </p>

    <form class="search-bar" @submit.prevent="runSearch">
      <label class="search-field">
        <span class="label">关键词</span>
        <input
          v-model="keyword"
          type="search"
          placeholder="如：存放同业、G01、第三部分、25a"
          autocomplete="off"
        />
      </label>
      <button type="submit" class="btn btn-primary" :disabled="searching || !keyword.trim()">
        {{ searching ? '搜索中…' : '搜索说明' }}
      </button>
    </form>

    <p v-if="error" class="feedback error">{{ error }}</p>
    <p v-else-if="searched && !result?.totalDocuments" class="feedback">
      未在填报说明中找到「{{ lastKeyword }}」
    </p>
    <p v-else-if="result?.totalDocuments" class="result-summary">
      共 {{ result.totalDocuments }} 份说明、{{ result.totalHits }} 处命中
      <span v-if="result.truncated">（结果已截断）</span>
    </p>

    <div v-if="result?.items?.length" class="doc-search-layout">
      <aside class="hit-list">
        <div
          v-for="item in result.items"
          :key="item.id"
          class="hit-group"
          :class="{ active: selectedId === item.id }"
        >
          <button type="button" class="hit-group-head" @click="selectDocument(item)">
            <span class="code">{{ item.docCode }}</span>
            <span class="title">{{ item.docTitle }}</span>
            <span class="meta">
              {{ item.reportCode ? `表样 ${item.reportCode} · ` : '' }}{{ item.hitCount }} 处命中
            </span>
          </button>
          <ul v-if="selectedId === item.id" class="hit-rows">
            <li v-if="loadingHits" class="muted">加载命中…</li>
            <template v-else>
              <li v-for="(hit, i) in hitsForSelected" :key="i">
                <button type="button" class="hit-row" @click="selectHit(item, hit)">
                  <span class="pos">{{ hitKindLabel(hit) }}</span>
                  <span class="snippet">{{ hit.snippet }}</span>
                </button>
              </li>
              <li v-if="hitsTruncated" class="muted">… 还有更多命中</li>
            </template>
          </ul>
        </div>
      </aside>

      <div class="preview-pane">
        <p v-if="loadingDetail" class="muted">加载说明…</p>
        <template v-else-if="detail">
          <header class="preview-header">
            <h2>{{ detail.docCode }} — {{ detail.docTitle }}</h2>
            <p class="preview-meta">
              关键词「{{ lastKeyword }}」
              <span v-if="focusNodeId"> · 已定位节点 #{{ focusNodeId }}</span>
              <router-link :to="{ name: 'documentDetail', params: { id: detail.id } }" class="btn-link">
                在说明树中打开 →
              </router-link>
            </p>
          </header>
          <DocumentTree
            :tree="detail.tree"
            :highlight-node-id="focusNodeId"
            :highlight-indicator-no="focusIndicatorNo"
          />
        </template>
        <p v-else class="muted empty-hint">点击左侧说明查看命中明细并预览</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { getDocument, getDocumentSearchHitsApi, searchDocumentsApi } from '../api';
import DocumentTree from '../components/document/DocumentTree.vue';

const KIND_LABELS = {
  part: '部分',
  general_item: '条目',
  section: '分节',
  indicator: '指标',
  body: '正文',
  document_code: '代号',
  document_title: '标题',
};

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
const focusNodeId = ref(null);
const focusIndicatorNo = ref(null);

function hitKindLabel(hit) {
  if (hit.nodeKind === 'indicator' && hit.indicatorKey) return `#${hit.indicatorKey}`;
  if (hit.nodeKind === 'indicator' && hit.indicatorNo != null) return `#${hit.indicatorNo}`;
  return KIND_LABELS[hit.nodeKind] || hit.nodeKind || '节点';
}

async function loadHits(id) {
  if (!lastKeyword.value) return;
  loadingHits.value = true;
  try {
    const res = await getDocumentSearchHitsApi(id, lastKeyword.value);
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
  focusNodeId.value = null;
  focusIndicatorNo.value = null;

  try {
    result.value = await searchDocumentsApi(q);
    lastKeyword.value = q;
    searched.value = true;
    if (result.value.items?.length) {
      await selectDocument(result.value.items[0]);
    }
  } catch (e) {
    error.value = e.message || '搜索失败';
  } finally {
    searching.value = false;
  }
}

async function selectDocument(item) {
  selectedId.value = item.id;
  focusNodeId.value = null;
  focusIndicatorNo.value = null;
  await Promise.all([loadDetail(item.id), loadHits(item.id)]);
}

async function selectHit(item, hit) {
  selectedId.value = item.id;
  focusNodeId.value = hit?.nodeId ?? null;
  focusIndicatorNo.value =
    hit?.nodeKind === 'indicator' && hit.indicatorNo != null ? hit.indicatorNo : null;
  if (detail.value?.id !== item.id) {
    await loadDetail(item.id);
  }
  if (!hitsForSelected.value.length) {
    await loadHits(item.id);
  }
}

async function loadDetail(id) {
  if (detail.value?.id === id) return;
  loadingDetail.value = true;
  try {
    detail.value = await getDocument(id);
  } catch (e) {
    detail.value = null;
    error.value = e.message || '加载说明失败';
  } finally {
    loadingDetail.value = false;
  }
}
</script>

<style scoped>
.doc-search-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}

.hint {
  padding: 10px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: var(--radius-sm);
  font-size: 13px;
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

.doc-search-layout {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.hit-list {
  width: 320px;
  flex-shrink: 0;
  overflow: auto;
  max-height: calc(100vh - var(--header-h) - 160px);
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
  line-height: 1.4;
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
  min-width: 36px;
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
  margin-bottom: 4px;
}

.preview-meta {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.preview-pane :deep(.document-tree-wrap) {
  flex: 1;
  max-height: calc(100vh - var(--header-h) - 140px);
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
