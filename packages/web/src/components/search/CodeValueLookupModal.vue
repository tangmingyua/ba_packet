<template>
  <Teleport to="body">
    <div class="code-value-modal-overlay" @click.self="emit('close')">
      <div class="code-value-modal" role="dialog" aria-modal="true" @click.stop>
        <div class="code-value-modal-header">
          <div class="code-value-modal-titles">
            <h3 class="code-value-modal-title">码值表</h3>
            <p v-if="dictName" class="code-value-modal-subtitle">{{ dictName }}</p>
            <p v-else-if="parseError" class="code-value-modal-subtitle error">{{ parseError }}</p>
          </div>
          <button type="button" class="code-value-modal-close" aria-label="关闭" @click="emit('close')">
            ×
          </button>
        </div>

        <div v-if="sourceText" class="code-value-modal-source">
          <span class="label">来源字段</span>
          <span class="text">{{ sourceText }}</span>
        </div>

        <div class="code-value-modal-body">
          <p v-if="parseError" class="empty-hint">{{ parseError }}</p>
          <p v-else-if="loading" class="empty-hint">加载中…</p>
          <p v-else-if="loadError" class="empty-hint error">{{ loadError }}</p>
          <p v-else-if="!items.length" class="empty-hint">该码表下暂无数据</p>
          <div v-else class="table-scroll-panel">
            <table class="simple-table code-value-table">
              <thead>
                <tr>
                  <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in items" :key="idx">
                  <td v-for="col in columns" :key="col.key">{{ cellText(item[col.key]) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="items.length" class="code-value-modal-footer">
          <span class="summary muted">共 {{ items.length }} 条</span>
          <button type="button" class="btn" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { listCodeValues } from '../../api';
import { buildCodeValueTableColumns } from '../../utils/codeValueColumns.js';

const props = defineProps({
  moduleCode: { type: String, default: '' },
  dictName: { type: String, default: '' },
  sourceText: { type: String, default: '' },
  parseError: { type: String, default: '' },
});

const emit = defineEmits(['close']);

const loading = ref(false);
const loadError = ref('');
const items = ref([]);
const columns = ref(buildCodeValueTableColumns());

function cellText(value) {
  if (value == null || value === '') return '—';
  return String(value);
}

async function loadData() {
  if (!props.moduleCode || !props.dictName || props.parseError) return;
  loading.value = true;
  loadError.value = '';
  items.value = [];
  try {
    const res = await listCodeValues(props.moduleCode, props.dictName);
    items.value = res.items || [];
    columns.value = buildCodeValueTableColumns(res.display || []);
  } catch (err) {
    loadError.value = err?.message || '加载码值失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.code-value-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
}

.code-value-modal {
  width: min(960px, 100%);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.code-value-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.code-value-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.code-value-modal-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6b7280;
}

.code-value-modal-subtitle.error {
  color: #b91c1c;
}

.code-value-modal-close {
  border: none;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  color: #6b7280;
  cursor: pointer;
  padding: 0 4px;
}

.code-value-modal-close:hover {
  color: #111827;
}

.code-value-modal-source {
  padding: 10px 20px;
  font-size: 12px;
  color: #6b7280;
  background: #f9fafb;
  border-bottom: 1px solid #eef2f7;
}

.code-value-modal-source .label {
  margin-right: 8px;
  color: #9ca3af;
}

.code-value-modal-source .text {
  color: #374151;
  word-break: break-all;
}

.code-value-modal-body {
  flex: 1;
  min-height: 120px;
  overflow: auto;
  padding: 16px 20px;
}

.table-scroll-panel {
  overflow: auto;
  max-height: 52vh;
}

.code-value-table {
  min-width: 100%;
}

.code-value-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
}

.empty-hint {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}

.empty-hint.error {
  color: #b91c1c;
}

.summary.muted {
  font-size: 13px;
  color: #6b7280;
}
</style>
