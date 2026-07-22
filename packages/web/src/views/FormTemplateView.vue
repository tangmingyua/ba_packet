<template>
  <section class="form-template-page">
    <p v-if="loadError" class="feedback error">{{ loadError }}</p>

    <div class="form-template-layout">
      <aside class="form-template-list">
        <div class="list-header">
          <h3>1104 表样</h3>
          <router-link to="/import?tab=formTemplate" class="btn-link">去导入</router-link>
        </div>
        <p v-if="loadingList" class="muted">加载中…</p>
        <p v-else-if="!items.length" class="muted empty-hint">
          暂无表样。
          <router-link to="/import?tab=formTemplate">前往导入</router-link>
        </p>
        <ul v-else class="template-items">
          <li v-for="item in items" :key="item.id">
            <router-link
              :to="{ name: 'formTemplateDetail', params: { id: item.id } }"
              class="template-item"
              :class="{ active: activeId === item.id }"
            >
              <span class="code">{{ item.reportCode }}</span>
              <span class="title">{{ item.reportTitle || item.sheetName }}</span>
              <span class="meta">版本 {{ item.versionLabel }} · {{ item.rowCount }}×{{ item.colCount }}</span>
            </router-link>
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
                {{ detail.rowCount }} 行 × {{ detail.colCount }} 列 ·
                {{ detail.merges?.length ?? 0 }} 处合并
              </p>
              <p class="preview-hint">点击指标名称（如「4. 存放同业款项」或附表 C 列「4.1 …」）查看对应填报说明</p>
            </div>
            <button
              type="button"
              class="btn danger"
              :disabled="deleting"
              @click="removeActiveTemplate"
            >
              {{ deleting ? '删除中…' : '删除表样' }}
            </button>
          </header>

          <div class="preview-body">
            <FormTemplateMatrix
              :matrix="detail.matrix"
              :merges="detail.merges"
              :selected-cell="selectedCell"
              enable-indicator-click
              @cell-click="onIndicatorCellClick"
            />

            <aside class="instruction-panel">
              <div class="instruction-header">
                <h3>填报说明</h3>
                <button
                  v-if="instruction || instructionError || selectedCell"
                  type="button"
                  class="btn-link"
                  @click="clearInstruction"
                >
                  清除
                </button>
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
              <p v-else class="muted empty-hint">点击左侧表样中的指标名称</p>
            </aside>
          </div>
        </template>
        <p v-else-if="items.length && !activeId" class="muted empty-hint">请从左侧选择表样</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getFormTemplate,
  listFormTemplates,
  deleteFormTemplate,
  getDocumentByReport,
  getDocumentIndicator,
} from '../api';
import FormTemplateMatrix from '../components/form-template/FormTemplateMatrix.vue';
import { resolveIndicatorKeyAtCell } from '../utils/formTemplateIndicator.js';

const route = useRoute();
const router = useRouter();

const items = ref([]);
const detail = ref(null);
const loadingList = ref(false);
const loadingDetail = ref(false);
const deleting = ref(false);
const loadError = ref('');

const selectedCell = ref(null);
const instruction = ref(null);
const instructionError = ref('');
const loadingInstruction = ref(false);

const activeId = computed(() => {
  const id = Number(route.params.id);
  return Number.isFinite(id) && id > 0 ? id : null;
});

const instructionBodies = computed(() =>
  (instruction.value?.indicator?.children || [])
    .filter((c) => c.nodeKind === 'body')
    .map((c) => c.text)
);

async function refreshList() {
  loadingList.value = true;
  loadError.value = '';
  try {
    const res = await listFormTemplates();
    items.value = res.items || [];
    if (!activeId.value && items.value.length) {
      router.replace({ name: 'formTemplateDetail', params: { id: items.value[0].id } });
    }
  } catch (e) {
    loadError.value = e.message || '加载表样列表失败';
  } finally {
    loadingList.value = false;
  }
}

function clearInstruction() {
  selectedCell.value = null;
  instruction.value = null;
  instructionError.value = '';
}

async function loadDetail(id) {
  if (!id) {
    detail.value = null;
    clearInstruction();
    return;
  }
  loadingDetail.value = true;
  loadError.value = '';
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

async function removeActiveTemplate() {
  if (!detail.value) return;
  const { reportCode, versionLabel, id } = detail.value;
  if (
    !confirm(
      `确认删除表样「${reportCode} / 版本 ${versionLabel}」？\n将同时删除其搜索索引，此操作不可恢复。`
    )
  ) {
    return;
  }

  deleting.value = true;
  loadError.value = '';
  try {
    await deleteFormTemplate(id);
    detail.value = null;
    clearInstruction();
    await refreshList();
    if (!items.value.length) {
      router.replace({ name: 'formTemplates' });
    }
  } catch (e) {
    loadError.value = e.message || '删除表样失败';
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
    router.replace({ name: 'formTemplateDetail', params: { id: list[0].id } });
  }
});

refreshList();
</script>

<style scoped>
.form-template-page {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.form-template-layout {
  display: flex;
  gap: 16px;
  min-height: 0;
  flex: 1;
  align-items: stretch;
}

.form-template-list {
  width: 260px;
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

.template-items {
  list-style: none;
  overflow: auto;
  flex: 1;
  padding: 8px;
}

.template-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: inherit;
  border: 1px solid transparent;
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
  font-size: 13px;
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

.form-template-preview {
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
.preview-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.preview-hint {
  margin-top: 4px;
  color: var(--text-muted);
}

.preview-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  align-items: stretch;
}

.preview-body :deep(.form-template-matrix-wrap) {
  flex: 1;
  min-width: 0;
  max-height: calc(100vh - var(--header-h) - 140px);
}

.instruction-panel {
  width: 320px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100vh - var(--header-h) - 140px);
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
