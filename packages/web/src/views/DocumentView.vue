<template>
  <section class="document-page">
    <p v-if="loadError" class="feedback error">{{ loadError }}</p>

    <div class="document-layout">
      <aside class="document-list">
        <div class="list-header">
          <h3>1104 填报说明</h3>
          <router-link to="/import?tab=fillInstruction" class="btn-link">去导入</router-link>
        </div>
        <p v-if="loadingList" class="muted">加载中…</p>
        <p v-else-if="!items.length" class="muted empty-hint">
          暂无填报说明。
          <router-link to="/import?tab=fillInstruction">前往导入</router-link>
        </p>
        <ul v-else class="document-items">
          <li v-for="item in items" :key="item.id">
            <router-link
              :to="{ name: 'documentDetail', params: { id: item.id }, query: route.query }"
              class="document-item"
              :class="{ active: activeId === item.id }"
            >
              <span class="code">{{ item.docCode }}</span>
              <span class="report">{{ item.reportCode || '未关联表样' }}</span>
              <span class="title">{{ item.docTitle }}</span>
              <span class="meta">{{ item.nodeCount ?? 0 }} 节点</span>
            </router-link>
          </li>
        </ul>
      </aside>

      <div class="document-preview">
        <p v-if="loadingDetail" class="muted">加载说明…</p>
        <template v-else-if="detail">
          <header class="preview-header">
            <div>
              <h2>{{ detail.docCode }} — {{ detail.docTitle }}</h2>
              <p class="preview-meta">
                {{ detail.nodeCount ?? 0 }} 节点 · 导入 {{ detail.importedAt }} ·
                {{ detail.sourceFileName || '—' }}
              </p>
              <div class="report-mapping-row">
                <label class="report-mapping-label" for="report-code-input">对应表样</label>
                <input
                  id="report-code-input"
                  v-model="reportCodeEdit"
                  class="report-mapping-input"
                  placeholder="如 G0100，留空表示不关联"
                />
                <button
                  type="button"
                  class="btn"
                  :disabled="savingReportMapping"
                  @click="saveReportMapping"
                >
                  {{ savingReportMapping ? '保存中…' : '保存关联' }}
                </button>
                <button
                  v-if="reportCodeEdit"
                  type="button"
                  class="btn-link"
                  :disabled="savingReportMapping"
                  @click="clearReportMapping"
                >
                  清除
                </button>
                <span
                  v-if="detail.suggestedReportCode && !detail.reportCode"
                  class="mapping-hint"
                >
                  建议 {{ detail.suggestedReportCode }}
                </span>
              </div>
              <p v-if="reportMappingMessage" class="mapping-feedback" :class="reportMappingMessageType">
                {{ reportMappingMessage }}
              </p>
              <p v-if="kindSummary" class="preview-kinds">{{ kindSummary }}</p>
            </div>
            <button
              type="button"
              class="btn danger"
              :disabled="deleting"
              @click="removeActiveDocument"
            >
              {{ deleting ? '删除中…' : '删除说明' }}
            </button>
          </header>

          <div v-if="highlightIndicatorNo != null" class="highlight-banner">
            已定位指标 #{{ highlightIndicatorNo }}
            <router-link
              :to="{ name: 'documentDetail', params: { id: detail.id } }"
              class="btn-link"
            >
              清除定位
            </router-link>
          </div>

          <DocumentTree
            :tree="detail.tree"
            :highlight-indicator-no="highlightIndicatorNo"
          />
        </template>
        <p v-else-if="items.length && !activeId" class="muted empty-hint">请从左侧选择填报说明</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { deleteDocument, getDocument, listDocuments, updateDocumentReportMapping } from '../api';
import DocumentTree from '../components/document/DocumentTree.vue';

const route = useRoute();
const router = useRouter();

const items = ref([]);
const detail = ref(null);
const loadingList = ref(false);
const loadingDetail = ref(false);
const deleting = ref(false);
const loadError = ref('');
const reportCodeEdit = ref('');
const savingReportMapping = ref(false);
const reportMappingMessage = ref('');
const reportMappingMessageType = ref('');

const activeId = computed(() => {
  const id = Number(route.params.id);
  return Number.isFinite(id) && id > 0 ? id : null;
});

const highlightIndicatorNo = computed(() => {
  const raw = route.query.indicator;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
});

const kindSummary = computed(() => {
  if (!detail.value?.tree) return '';
  const counts = countKinds(detail.value.tree);
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${kindLabel(kind)} ${n}`)
    .join(' · ');
  return parts || '';
});

function kindLabel(kind) {
  const map = {
    part: '部分',
    general_item: '条目',
    section: '分节',
    indicator: '指标',
    body: '正文',
  };
  return map[kind] || kind;
}

function countKinds(node, acc = {}) {
  if (!node) return acc;
  if (node.nodeKind && node.nodeKind !== 'doc_title') {
    acc[node.nodeKind] = (acc[node.nodeKind] || 0) + 1;
  }
  for (const child of node.children || []) {
    countKinds(child, acc);
  }
  return acc;
}

async function refreshList() {
  loadingList.value = true;
  loadError.value = '';
  try {
    const res = await listDocuments();
    items.value = res.items || [];
    if (!activeId.value && items.value.length) {
      router.replace({ name: 'documentDetail', params: { id: items.value[0].id } });
    }
  } catch (e) {
    loadError.value = e.message || '加载填报说明列表失败';
  } finally {
    loadingList.value = false;
  }
}

async function loadDetail(id) {
  if (!id) {
    detail.value = null;
    reportCodeEdit.value = '';
    return;
  }
  loadingDetail.value = true;
  loadError.value = '';
  reportMappingMessage.value = '';
  try {
    detail.value = await getDocument(id);
    reportCodeEdit.value = detail.value.reportCode || '';
  } catch (e) {
    detail.value = null;
    reportCodeEdit.value = '';
    loadError.value = e.message || '加载填报说明失败';
  } finally {
    loadingDetail.value = false;
  }
}

async function saveReportMapping() {
  if (!detail.value) return;
  savingReportMapping.value = true;
  reportMappingMessage.value = '';
  try {
    const result = await updateDocumentReportMapping(detail.value.id, reportCodeEdit.value);
    reportMappingMessageType.value = 'success';
    reportMappingMessage.value = result.message || '已保存';
    await loadDetail(detail.value.id);
    await refreshList();
  } catch (e) {
    reportMappingMessageType.value = 'error';
    reportMappingMessage.value = e.message || '保存失败';
  } finally {
    savingReportMapping.value = false;
  }
}

async function clearReportMapping() {
  reportCodeEdit.value = '';
  await saveReportMapping();
}

async function removeActiveDocument() {
  if (!detail.value) return;
  const { docCode, id } = detail.value;
  if (!confirm(`确认删除填报说明「${docCode}」？\n此操作不可恢复。`)) return;

  deleting.value = true;
  loadError.value = '';
  try {
    await deleteDocument(id);
    detail.value = null;
    await refreshList();
    if (!items.value.length) {
      router.replace({ name: 'documents' });
    }
  } catch (e) {
    loadError.value = e.message || '删除填报说明失败';
  } finally {
    deleting.value = false;
  }
}

watch(
  () => route.params.id,
  (id) => {
    loadDetail(Number(id));
  },
  { immediate: true }
);

watch(items, (list) => {
  if (activeId.value && !list.some((x) => x.id === activeId.value) && list.length) {
    router.replace({ name: 'documentDetail', params: { id: list[0].id } });
  }
});

refreshList();
</script>

<style scoped>
.document-page {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.document-layout {
  display: flex;
  gap: 16px;
  min-height: 0;
  flex: 1;
  align-items: stretch;
}

.document-list {
  width: 280px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100vh - var(--header-h) - 48px);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.list-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.document-items {
  list-style: none;
  overflow: auto;
  flex: 1;
  padding: 8px;
}

.document-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: inherit;
  border: 1px solid transparent;
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
  font-size: 13px;
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

.document-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.preview-header h2 {
  font-size: 16px;
  margin-bottom: 4px;
}

.preview-meta,
.preview-kinds {
  font-size: 12px;
  color: var(--text-secondary);
}

.preview-kinds {
  margin-top: 4px;
}

.report-mapping-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.report-mapping-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.report-mapping-input {
  width: 140px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.mapping-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.mapping-feedback {
  margin-top: 6px;
  font-size: 12px;
}

.mapping-feedback.success {
  color: #15803d;
}

.mapping-feedback.error {
  color: #b91c1c;
}

.highlight-banner {
  font-size: 12px;
  padding: 8px 12px;
  background: #fef9c3;
  border: 1px solid #fde047;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 12px;
}

.document-preview :deep(.document-tree-wrap) {
  max-height: calc(100vh - var(--header-h) - 160px);
}

.muted {
  color: var(--text-muted);
  font-size: 13px;
  padding: 12px;
}

.empty-hint {
  padding: 24px;
}

.btn.danger {
  flex-shrink: 0;
  color: #b91c1c;
  border-color: #fecaca;
  background: #fef2f2;
}

.btn.danger:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #fca5a5;
}
</style>
