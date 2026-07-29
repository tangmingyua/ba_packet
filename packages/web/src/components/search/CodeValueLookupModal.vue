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

        <div v-if="items.length && columns.length" class="code-value-modal-filters">
          <div class="filters-head">
            <span class="filters-label">列筛选</span>
            <button v-if="customFilters.length" type="button" class="btn-link" @click="resetFilters">
              重置
            </button>
          </div>

          <div
            v-for="(rule, index) in customFilters"
            :key="rule.id"
            class="filter-row"
          >
            <span v-if="customFilters.length > 1" class="filter-index">{{ index + 1 }}</span>
            <label class="filter-field">
              <span class="sr-only">列</span>
              <select
                :value="rule.col"
                @change="updateRule(rule.id, { col: ($event.target).value })"
              >
                <option value="">选择列</option>
                <option v-for="col in columns" :key="col.key" :value="col.label">
                  {{ col.label }}
                </option>
              </select>
            </label>
            <label class="filter-field filter-field-op">
              <span class="sr-only">条件</span>
              <select
                :value="rule.op"
                @change="updateRule(rule.id, { op: ($event.target).value })"
              >
                <option v-for="op in operators" :key="op.value" :value="op.value">
                  {{ op.label }}
                </option>
              </select>
            </label>
            <label class="filter-field filter-field-val">
              <span class="sr-only">筛选值</span>
              <input
                :value="rule.val"
                type="text"
                class="filter-input"
                placeholder="筛选值"
                :disabled="isNoValueOp(rule.op)"
                @input="updateRule(rule.id, { val: ($event.target).value })"
              />
            </label>
            <button
              type="button"
              class="btn-icon"
              title="删除此条件"
              @click="removeRule(rule.id)"
            >
              ×
            </button>
          </div>

          <button type="button" class="btn-add-filter" @click="addRule">
            {{ customFilters.length ? '+ 添加条件' : '+ 按列筛选' }}
          </button>
        </div>

        <div class="code-value-modal-body">
          <p v-if="parseError" class="empty-hint">{{ parseError }}</p>
          <p v-else-if="loading" class="empty-hint">加载中…</p>
          <p v-else-if="loadError" class="empty-hint error">{{ loadError }}</p>
          <p v-else-if="!items.length" class="empty-hint">找不到对应码值</p>
          <p v-else-if="!filteredItems.length" class="empty-hint">无匹配结果，请调整筛选条件</p>
          <div v-else class="table-scroll-panel">
            <table class="simple-table code-value-table">
              <thead>
                <tr>
                  <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in filteredItems" :key="idx">
                  <td v-for="col in columns" :key="col.key">{{ cellText(item[col.key]) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="items.length" class="code-value-modal-footer">
          <span class="summary muted">
            <template v-if="hasActiveFilters && filteredItems.length !== items.length">
              共 {{ filteredItems.length }} 条 / 全部 {{ items.length }} 条
            </template>
            <template v-else>共 {{ items.length }} 条</template>
          </span>
          <button type="button" class="btn" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { listCodeValues } from '../../api';
import { buildCodeValueTableColumns } from '../../utils/codeValueColumns.js';
import {
  FILTER_OPERATORS,
  NO_VALUE_OPERATORS,
  createFilterRule,
  matchesFilterRule,
  normalizeActiveFilters,
} from '../../composables/useDynamicTable.js';

const props = defineProps({
  moduleCode: { type: String, default: '' },
  dictName: { type: String, default: '' },
  sourceText: { type: String, default: '' },
  parseError: { type: String, default: '' },
});

const emit = defineEmits(['close']);

const operators = FILTER_OPERATORS;
const loading = ref(false);
const loadError = ref('');
const items = ref([]);
const columns = ref(buildCodeValueTableColumns());
const customFilters = ref([]);

function cellText(value) {
  if (value == null || value === '') return '—';
  return String(value);
}

function isNoValueOp(op) {
  return NO_VALUE_OPERATORS.has(op);
}

function buildFilterRow(item, cols) {
  const row = {};
  for (const col of cols) {
    const raw = item[col.key];
    row[col.label] = raw == null || raw === '' ? '' : String(raw);
  }
  return row;
}

const activeFilterRules = computed(() => normalizeActiveFilters(customFilters.value));

const hasActiveFilters = computed(() => activeFilterRules.value.length > 0);

const filteredItems = computed(() => {
  const rules = activeFilterRules.value;
  if (!rules.length) return items.value;
  return items.value.filter((item) => {
    const row = buildFilterRow(item, columns.value);
    return rules.every((rule) => matchesFilterRule(row, rule));
  });
});

function updateRule(id, patch) {
  customFilters.value = customFilters.value.map((rule) =>
    rule.id === id ? { ...rule, ...patch } : rule
  );
}

function addRule() {
  const defaultCol = columns.value[0]?.label || '';
  customFilters.value = [...customFilters.value, createFilterRule({ col: defaultCol })];
}

function removeRule(id) {
  customFilters.value = customFilters.value.filter((rule) => rule.id !== id);
}

function resetFilters() {
  customFilters.value = [];
}

async function loadData() {
  if (!props.moduleCode || !props.dictName || props.parseError) return;
  loading.value = true;
  loadError.value = '';
  items.value = [];
  customFilters.value = [];
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

watch(
  () => [props.moduleCode, props.dictName],
  () => {
    loadData();
  }
);

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

.code-value-modal-filters {
  padding: 12px 20px;
  border-bottom: 1px solid #eef2f7;
  background: #fafbfc;
}

.filters-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.filters-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.filter-index {
  flex: 0 0 18px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

.filter-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.filter-field select,
.filter-input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
}

.filter-field-op {
  flex: 0 0 108px;
}

.filter-field-val {
  flex: 1 1 160px;
}

.btn-icon {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.btn-icon:hover {
  background: #f3f4f6;
  color: #111827;
}

.btn-add-filter {
  border: none;
  background: none;
  padding: 0;
  font-size: 13px;
  color: var(--accent-blue, #2563eb);
  cursor: pointer;
}

.btn-add-filter:hover {
  text-decoration: underline;
}

.btn-link {
  border: none;
  background: none;
  padding: 0;
  font-size: 13px;
  color: var(--accent-blue, #2563eb);
  cursor: pointer;
}

.btn-link:hover {
  text-decoration: underline;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
