<template>
  <section class="word-faithful-page">
    <p v-if="loadError" class="feedback error">{{ loadError }}</p>

    <div class="word-faithful-layout">
      <aside class="doc-list">
        <div class="list-header">
          <h3>Word 原样显示</h3>
          <router-link to="/import?tab=import" class="btn-link">去导入</router-link>
        </div>
        <p v-if="loadingList" class="muted">加载中…</p>
        <p v-else-if="!items.length" class="muted empty-hint">
          暂无文档。
          <router-link to="/import?tab=import">前往导入</router-link>
        </p>
        <ul v-else class="doc-items">
          <li v-for="item in items" :key="item.id">
            <router-link
              :to="docLink(item.id)"
              class="doc-item"
              :class="{ active: activeId === item.id }"
            >
              <span class="code">{{ item.docCode }}</span>
              <span class="title">{{ item.docTitle }}</span>
              <span class="meta">{{ item.blockCount ?? 0 }} 块 · {{ item.versionLabel || '—' }}</span>
            </router-link>
          </li>
        </ul>
      </aside>

      <div class="preview-pane">
        <p v-if="loadingDetail" class="muted">加载中…</p>
        <template v-else-if="detail">
          <header class="preview-header">
            <div>
              <h2>{{ detail.docCode }}</h2>
              <p class="preview-meta">
                {{ detail.blockCount ?? 0 }} 块 · 版本 {{ detail.versionLabel || '—' }} ·
                {{ detail.sourceFileName || '—' }}
              </p>
            </div>
            <button type="button" class="btn danger" :disabled="deleting" @click="removeActive">
              {{ deleting ? '删除中…' : '删除' }}
            </button>
          </header>

          <p v-if="previewNotice" class="feedback">{{ previewNotice }}</p>
          <p v-if="rendering" class="muted">正在渲染 Word…</p>

          <form class="inline-search" @submit.prevent="runInlineSearch">
            <input
              v-model="inlineKeyword"
              type="search"
              placeholder="在本文档内搜索…"
              autocomplete="off"
            />
            <button type="submit" class="btn" :disabled="!inlineKeyword.trim()">搜索</button>
            <template v-if="findTotal > 0">
              <span class="find-status">{{ findActiveIndex + 1 }} / {{ findTotal }}</span>
              <button type="button" class="btn" :disabled="findTotal <= 1" @click="stepFind(-1)">
                上一处
              </button>
              <button type="button" class="btn" :disabled="findTotal <= 1" @click="stepFind(1)">
                下一处
              </button>
            </template>
          </form>

          <p v-if="findMessage" class="find-message muted">{{ findMessage }}</p>

          <ul v-if="inlineHits.length" class="hit-list">
            <li v-for="(hit, i) in inlineHits" :key="i">
              <button
                type="button"
                class="hit-row"
                :class="{ active: activeHitIndex === i }"
                @click="focusHit(hit, i)"
              >
                <span class="pos">{{ hitKindLabel(hit) }}</span>
                <span class="snippet">{{ hit.snippet }}</span>
              </button>
            </li>
          </ul>

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
        <p v-else-if="items.length && !activeId" class="muted empty-hint">请从左侧选择文档</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { renderAsync } from 'docx-preview';
import {
  deleteWordFaithfulDocument,
  fetchWordFaithfulFile,
  getWordFaithfulDocument,
  getWordFaithfulSearchHitsApi,
  listWordFaithfulDocuments,
} from '../api';
import {
  applyFindHighlight,
  applyPreviewZoom,
  clearFindHighlights,
  PREVIEW_ZOOM,
  preventPreviewHashLinkNavigation,
  resolveMatchIndexForHit,
} from '../utils/wordFaithfulPreview.js';
import WordPreviewZoomBar from '../components/search/WordPreviewZoomBar.vue';

const route = useRoute();
const router = useRouter();

const items = ref([]);
const detail = ref(null);
const loadingList = ref(false);
const loadingDetail = ref(false);
const rendering = ref(false);
const deleting = ref(false);
const loadError = ref('');
const previewNotice = ref('');
const useFallbackHtml = ref(false);
const fallbackHtml = ref('');
const previewRef = ref(null);
const fallbackRef = ref(null);
const inlineKeyword = ref('');
const inlineHits = ref([]);
const findTotal = ref(0);
const findActiveIndex = ref(0);
const findMessage = ref('');
const activeHitIndex = ref(-1);
const previewZoom = ref(PREVIEW_ZOOM.default);

const activeId = computed(() => {
  const id = Number(route.params.id);
  return Number.isFinite(id) && id > 0 ? id : null;
});

const focusQuery = computed(() => {
  const q = route.query.q;
  return q == null ? '' : String(Array.isArray(q) ? q[0] : q).trim();
});

const focusHitQuery = computed(() => {
  const raw = route.query.hit;
  if (raw == null) return null;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) ? n : null;
});

function docLink(id) {
  const query = {};
  if (focusQuery.value) query.q = focusQuery.value;
  if (focusHitQuery.value != null) query.hit = String(focusHitQuery.value);
  return { name: 'wordFaithfulDetail', params: { id }, query };
}

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

function syncPreviewZoom() {
  applyPreviewZoom(activePreviewRoot(), previewZoom.value);
}

function resetPreviewZoom() {
  previewZoom.value = PREVIEW_ZOOM.default;
  syncPreviewZoom();
}

function applyFindAtIndex(index, { hitIndex = -1 } = {}) {
  const root = activePreviewRoot();
  const q = inlineKeyword.value.trim();
  if (!root || !q) {
    resetFindState();
    return;
  }

  const scrollEl = useFallbackHtml.value ? fallbackRef.value : previewRef.value;
  const result = applyFindHighlight(root, q, index, scrollEl);
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

async function refreshList() {
  loadingList.value = true;
  loadError.value = '';
  try {
    const body = await listWordFaithfulDocuments();
    items.value = body.items || [];
  } catch (e) {
    loadError.value = e.message || '加载列表失败';
  } finally {
    loadingList.value = false;
  }
}

async function loadDetail(id) {
  if (!id) {
    detail.value = null;
    resetFindState();
    useFallbackHtml.value = false;
    fallbackHtml.value = '';
    if (previewRef.value) previewRef.value.innerHTML = '';
    return;
  }
  loadingDetail.value = true;
  loadError.value = '';
  resetFindState();
  resetPreviewZoom();
  useFallbackHtml.value = false;
  fallbackHtml.value = '';
  try {
    detail.value = await getWordFaithfulDocument(id);
    inlineKeyword.value = focusQuery.value;
  } catch (e) {
    loadError.value = e.message || '加载文档失败';
    detail.value = null;
    return;
  } finally {
    loadingDetail.value = false;
  }

  await nextTick();
  await renderDocxPreview(id);
  await nextTick();

  if (focusQuery.value) {
    await runInlineSearch({ skipRoute: true });
    if (focusHitQuery.value != null && inlineHits.value[focusHitQuery.value]) {
      focusHit(inlineHits.value[focusHitQuery.value], focusHitQuery.value, { skipRoute: true });
    } else {
      applyFindAtIndex(0);
    }
  }
}

async function runInlineSearch({ skipRoute = false } = {}) {
  const q = inlineKeyword.value.trim();
  if (!activeId.value || !q) {
    inlineHits.value = [];
    resetFindState();
    return;
  }
  try {
    const result = await getWordFaithfulSearchHitsApi(activeId.value, q);
    inlineHits.value = result.hits || [];
  } catch {
    inlineHits.value = [];
  }

  await nextTick();
  applyFindAtIndex(0);

  if (!skipRoute) {
    router.replace({
      name: 'wordFaithfulDetail',
      params: { id: activeId.value },
      query: { q, hit: findTotal.value > 0 ? '0' : undefined },
    });
  }
}

function stepFind(delta) {
  if (findTotal.value <= 0) return;
  const next = (findActiveIndex.value + delta + findTotal.value) % findTotal.value;
  activeHitIndex.value = -1;
  applyFindAtIndex(next);
}

function focusHit(hit, hitIndex, { skipRoute = false } = {}) {
  const root = activePreviewRoot();
  const q = inlineKeyword.value.trim();
  if (!root || !q) return;

  clearFindHighlights(root);
  const matchIndex = resolveMatchIndexForHit(root, q, hit, hitIndex);
  applyFindAtIndex(matchIndex, { hitIndex });

  if (!skipRoute) {
    router.replace({
      name: 'wordFaithfulDetail',
      params: { id: activeId.value },
      query: {
        q,
        hit: String(hitIndex),
        find: String(matchIndex),
      },
    });
  }
}

async function removeActive() {
  if (!activeId.value || !confirm('确定删除该文档？')) return;
  deleting.value = true;
  try {
    await deleteWordFaithfulDocument(activeId.value);
    await refreshList();
    router.push({ name: 'wordFaithful' });
  } catch (e) {
    loadError.value = e.message || '删除失败';
  } finally {
    deleting.value = false;
  }
}

watch(activeId, (id) => loadDetail(id), { immediate: true });

watch(
  () => route.fullPath,
  async () => {
    if (!detail.value || !focusQuery.value) return;
    if (inlineKeyword.value !== focusQuery.value) {
      inlineKeyword.value = focusQuery.value;
      await runInlineSearch({ skipRoute: true });
    }
    const hitIdx = focusHitQuery.value;
    if (hitIdx != null && inlineHits.value[hitIdx]) {
      focusHit(inlineHits.value[hitIdx], hitIdx, { skipRoute: true });
    }
  }
);

watch(previewZoom, () => {
  syncPreviewZoom();
});

watch(useFallbackHtml, async () => {
  await nextTick();
  syncPreviewZoom();
});

refreshList();
</script>

<style scoped>
.word-faithful-page {
  padding: 1rem 1.25rem;
  max-width: 1400px;
  margin: 0 auto;
}

.word-faithful-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1rem;
  align-items: start;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.doc-items {
  list-style: none;
  padding: 0;
  margin: 0;
}

.doc-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  text-decoration: none;
  color: inherit;
  border: 1px solid transparent;
}

.doc-item.active,
.doc-item:hover {
  background: var(--surface-muted, #f4f5f7);
  border-color: var(--border, #ddd);
}

.doc-item .code {
  font-weight: 600;
  font-size: 0.9rem;
}

.doc-item .meta {
  font-size: 0.75rem;
  color: var(--text-muted, #666);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.inline-search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.inline-search input {
  flex: 1 1 200px;
  min-width: 0;
}

.find-status {
  font-size: 0.85rem;
  color: var(--text-muted, #666);
  padding: 0 0.25rem;
}

.find-message {
  margin: -0.35rem 0 0.75rem;
  font-size: 0.85rem;
}

.hit-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  max-height: 160px;
  overflow: auto;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
}

.hit-row {
  display: flex;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  padding: 0.35rem 0.5rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.hit-row:hover,
.hit-row.active {
  background: var(--surface-muted, #f4f5f7);
}

.hit-row .pos {
  flex: 0 0 auto;
  font-size: 0.75rem;
  color: var(--text-muted, #666);
}

.wf-preview-shell {
  position: relative;
}

.wf-preview {
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  padding: 0.5rem;
  max-height: calc(100vh - 280px);
  overflow: auto;
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

@media (max-width: 900px) {
  .word-faithful-layout {
    grid-template-columns: 1fr;
  }
}
</style>
