<template>
  <section class="form-template-page">
    <p v-if="loadError" class="feedback error">{{ loadError }}</p>

    <div class="form-template-layout">
      <aside class="form-template-list">
        <div class="list-header">
          <h3>表样</h3>
          <router-link to="/import?tab=import&subtype=1104_FORM_TEMPLATE" class="btn-link">去导入</router-link>
        </div>
        <div class="list-filter">
          <label>
            <span>子类</span>
            <select v-model="selectedSubtypeCode">
              <option value="">全部</option>
              <option v-for="st in formTemplateSubtypes" :key="st.code" :value="st.code">
                {{ st.moduleCode }} · {{ st.name }}
              </option>
            </select>
          </label>
        </div>
        <p v-if="loadingList" class="muted">加载中…</p>
        <p v-else-if="!items.length" class="muted empty-hint">
          暂无表样。
          <router-link to="/import?tab=import&subtype=1104_FORM_TEMPLATE">前往导入</router-link>
        </p>
        <ul v-else class="template-items">
          <li v-for="item in items" :key="item.id">
            <router-link
              :to="{ name: 'formTemplateDetail', params: { id: item.id }, query: route.query }"
              class="template-item"
              :class="{ active: activeId === item.id }"
            >
              <span class="sheet-name">{{ listSheetLabel(item) }}</span>
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
              <h2>{{ formTemplateDisplayTitle(detail) }}</h2>
              <p class="preview-meta">
                版本 {{ detail.versionLabel }} ·
                {{ detail.rowCount }} 行 × {{ detail.colCount }} 列 ·
                {{ detail.merges?.length ?? 0 }} 处合并
              </p>
              <p class="preview-hint">点击指标名称查看填报说明；若存在匹配的主指标校验规则，将一并展示</p>
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
              :layout="detail.layout"
              :selected-cell="selectedCell"
              :enable-cell-full-text="detail?.moduleCode !== '1104'"
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
  listSubtypes,
  deleteFormTemplate,
} from '../api';
import FormTemplateMatrix from '../components/form-template/FormTemplateMatrix.vue';
import FormTemplateInstructionDrawer from '../components/form-template/FormTemplateInstructionDrawer.vue';
import { useFormTemplateInstructionPanel } from '../composables/useFormTemplateInstructionPanel.js';
import { formTemplateDisplayTitle, formTemplateListSheetLabel } from '../utils/formTemplateListDisplay.js';

const route = useRoute();
const router = useRouter();

const items = ref([]);
const detail = ref(null);
const loadingList = ref(false);
const loadingDetail = ref(false);
const deleting = ref(false);
const loadError = ref('');
const subtypes = ref([]);
const selectedSubtypeCode = ref(route.query.subtype || '');

const formTemplateSubtypes = computed(() =>
  subtypes.value.filter((s) => s.storageKind === 'form_template').sort((a, b) => a.sortOrder - b.sortOrder)
);

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

const activeId = computed(() => {
  const id = Number(route.params.id);
  return Number.isFinite(id) && id > 0 ? id : null;
});

async function refreshList() {
  loadingList.value = true;
  loadError.value = '';
  try {
    const res = await listFormTemplates({
      subtypeCode: selectedSubtypeCode.value || undefined,
    });
    items.value = res.items || [];
    if (!activeId.value && items.value.length) {
      router.replace({ name: 'formTemplateDetail', params: { id: items.value[0].id }, query: route.query });
    }
  } catch (e) {
    loadError.value = e.message || '加载表样列表失败';
  } finally {
    loadingList.value = false;
  }
}

async function loadSubtypes() {
  try {
    const res = await listSubtypes();
    subtypes.value = res.items || [];
  } catch (e) {
    loadError.value = e.message || '加载子类失败';
  }
}

function listSheetLabel(item) {
  return formTemplateListSheetLabel(item, {
    subtypeCode: selectedSubtypeCode.value || item?.subtypeCode,
  });
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

async function handleIndicatorCellClick({ row, col }) {
  await onIndicatorCellClick({
    matrix: detail.value?.matrix,
    reportCode: detail.value?.reportCode,
    versionLabel: detail.value?.versionLabel,
    row,
    col,
  });
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
      router.replace({ name: 'formTemplates', query: route.query });
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
    router.replace({ name: 'formTemplateDetail', params: { id: list[0].id }, query: route.query });
  }
});

watch(selectedSubtypeCode, (val, oldVal) => {
  if (val === oldVal) return;
  const query = val ? { subtype: val } : {};
  router.replace({ name: 'formTemplates', query });
});

watch(
  () => route.query.subtype,
  (val) => {
    selectedSubtypeCode.value = val || '';
    refreshList();
  }
);

loadSubtypes();
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
  gap: 12px;
  min-height: 0;
  flex: 1;
  align-items: stretch;
}

.form-template-list {
  width: 200px;
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

.list-filter {
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
}

.list-filter label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.list-filter select {
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
  color: var(--text);
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
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.preview-body :deep(.form-template-matrix-wrap) {
  width: 100%;
  max-height: calc(100vh - var(--header-h) - 130px);
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
