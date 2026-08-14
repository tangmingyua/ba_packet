<template>
  <div class="filter-bar-wrap" :class="{ compact: compact }">
    <div :class="['unified-filter-bar', variant === 'qa' ? 'qa-filter-bar' : 'filter-bar']">
      <div v-if="!hideKeyword" class="filter-group filter-group-keyword">
        <label>{{ keywordLabel }}</label>
        <input
          :value="keyword"
          type="text"
          class="filter-input-compact"
          :placeholder="keywordPlaceholder"
          autocomplete="off"
          @input="emit('update:keyword', ($event.target).value)"
          @keydown.down.prevent="emit('suggest-nav', 1)"
          @keydown.up.prevent="emit('suggest-nav', -1)"
          @keydown.enter.prevent="emit('search')"
          @keydown.escape="emit('suggest-hide')"
          @focus="emit('suggest-show')"
        />
        <div v-if="showSuggest" class="q-suggest show">
          <template v-if="suggestions.length">
            <div
              v-for="(item, index) in suggestions"
              :key="`${item.moduleCode || ''}-${item.reportCode}-${item.tableName}-${item.dataItemName}-${index}`"
              class="q-suggest-item"
              :class="{ active: index === suggestIndex }"
              @mousedown.prevent="emit('suggest-pick', item)"
            >
              <span v-html="highlightName(item.dataItemName)" />
              <span v-if="item.moduleName || item.moduleCode" class="q-module">{{
                item.moduleName || item.moduleCode
              }}</span>
              <span v-if="variant === 'qa' && item.reportName" class="q-subtype">{{ item.reportName }}</span>
              <span v-if="item.tableName" class="q-table">{{ item.tableName }}</span>
            </div>
          </template>
        </div>
      </div>

      <div class="custom-filters-inline">
        <template v-for="(rule, index) in localFilters" :key="rule.id">
          <div
            v-if="isMultiSelectRule(rule)"
            class="custom-filter-row-inline custom-filter-row-multi"
          >
            <span class="multi-select-field-name" :title="rule.col">{{ rule.col || '—' }}</span>
            <MultiSelectFilter
              :model-value="rule.val || []"
              :rows="rowsForFilterRule(index)"
              :col="rule.col"
              placeholder="请选择"
              @update:model-value="updateRule(rule.id, { val: $event })"
            />
            <button
              type="button"
              class="btn btn-icon"
              title="删除此条件"
              @click="removeRule(rule.id)"
            >
              ×
            </button>
          </div>
          <div v-else class="custom-filter-row-inline">
            <span v-if="localFilters.length > 1" class="custom-filter-index">{{ index + 1 }}</span>
            <div class="filter-group filter-group-col filter-group-col-sm">
              <label :class="{ 'sr-only': index > 0 }">筛选列</label>
              <input
                :value="rule.col"
                type="text"
                class="filter-input-compact"
                placeholder="列名"
                autocomplete="off"
                @input="onColInput(rule.id, ($event.target).value)"
                @focus="openColSuggest(rule.id)"
                @keydown.down.prevent="moveColSuggest(1)"
                @keydown.up.prevent="moveColSuggest(-1)"
                @keydown.enter.prevent="pickActiveColSuggest(rule.id)"
                @keydown.escape="closeColSuggest"
              />
              <div v-if="activeColSuggestRuleId === rule.id" class="col-suggest show">
                <template v-if="colSuggestionsForRule(rule).length">
                  <div
                    v-for="(col, colIdx) in colSuggestionsForRule(rule)"
                    :key="col"
                    class="col-suggest-item"
                    :class="{ active: colIdx === colSuggestIndex }"
                    @mousedown.prevent="pickColSuggestion(rule.id, col)"
                  >
                    {{ col }}
                  </div>
                </template>
                <div v-else-if="rule.col.trim()" class="col-suggest-empty">无匹配列</div>
              </div>
            </div>
            <div class="filter-group filter-group-op">
              <label :class="{ 'sr-only': index > 0 }">条件</label>
              <select
                :value="rule.op"
                @change="updateRule(rule.id, { op: ($event.target).value })"
              >
                <option v-for="op in operators" :key="op.value" :value="op.value">
                  {{ op.label }}
                </option>
              </select>
            </div>
            <div class="filter-group filter-group-val">
              <label :class="{ 'sr-only': index > 0 }">筛选值</label>
              <input
                :value="rule.val"
                type="text"
                class="filter-input-compact"
                placeholder="内容"
                :disabled="isNoValueOp(rule.op)"
                @input="updateRule(rule.id, { val: ($event.target).value })"
                @keydown.enter.prevent="emit('search')"
              />
            </div>
            <button
              type="button"
              class="btn btn-icon"
              title="删除此条件"
              @click="removeRule(rule.id)"
            >
              ×
            </button>
          </div>
        </template>

        <button type="button" class="btn btn-add-filter" @click="addRule">
          {{ localFilters.length ? '+ 添加条件' : '+ 自定义筛选' }}
        </button>
      </div>

      <div class="filter-actions">
        <button type="button" class="btn btn-primary" :disabled="loading" @click="emit('search')">
          筛选
        </button>
        <button type="button" class="btn btn-icon" title="重置筛选" @click="emit('reset')">↺</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  FILTER_OPERATORS,
  MULTI_SELECT_OPERATOR,
  NO_VALUE_OPERATORS,
  createFilterRule,
  filterColumnSuggestions,
  highlightKeyword,
  reconcileMultiSelectFilterValues,
  rowsForPriorFilterRules,
} from '../../composables/useDynamicTable.js';
import MultiSelectFilter from './MultiSelectFilter.vue';

const props = defineProps({
  variant: { type: String, default: 'norm' },
  keyword: { type: String, default: '' },
  tableFilter: { type: String, default: '__all__' },
  customFilters: { type: Array, default: () => [] },
  tableOptions: { type: Array, default: () => [] },
  columnOptions: { type: Array, default: () => [] },
  suggestions: { type: Array, default: () => [] },
  suggestIndex: { type: Number, default: -1 },
  showSuggest: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  mode: { type: String, default: 'norm' },
  hideKeyword: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  categoryFilter: { type: Array, default: () => [] },
  categoryOptions: { type: Array, default: () => [] },
  /** 当前结果行，用于多选下拉取去重值 */
  rows: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'update:keyword',
  'update:tableFilter',
  'update:customFilters',
  'search',
  'reset',
  'suggest-pick',
  'suggest-nav',
  'suggest-show',
  'suggest-hide',
]);

const operators = FILTER_OPERATORS;
const localFilters = ref([]);
const activeColSuggestRuleId = ref('');
const colSuggestIndex = ref(-1);

watch(
  () => props.customFilters,
  (rules) => {
    localFilters.value = (rules || []).map((r) => ({ ...r }));
  },
  { immediate: true, deep: true }
);

watch(
  () => props.rows,
  () => {
    const next = reconcileMultiSelectFilterValues(props.rows, localFilters.value);
    if (JSON.stringify(next) !== JSON.stringify(localFilters.value)) {
      localFilters.value = next;
      syncFilters();
    }
  }
);

function rowsForFilterRule(ruleIndex) {
  return rowsForPriorFilterRules(props.rows, localFilters.value, ruleIndex);
}

function syncFilters() {
  emit('update:customFilters', localFilters.value.map((r) => ({ ...r })));
}

function updateRule(id, patch) {
  const idx = localFilters.value.findIndex((r) => r.id === id);
  if (idx < 0) return;
  let next = localFilters.value.map((r) => (r.id === id ? { ...r, ...patch } : r));
  next = reconcileMultiSelectFilterValues(props.rows, next);
  localFilters.value = next;
  syncFilters();
}

function addRule() {
  localFilters.value = [...localFilters.value, createFilterRule()];
  syncFilters();
}

function removeRule(id) {
  localFilters.value = localFilters.value.filter((r) => r.id !== id);
  syncFilters();
}

function isNoValueOp(op) {
  return NO_VALUE_OPERATORS.has(op);
}

function isMultiSelectRule(rule) {
  return rule.op === MULTI_SELECT_OPERATOR;
}

function colSuggestionsForRule(rule) {
  return filterColumnSuggestions(props.columnOptions, rule?.col || '');
}

function openColSuggest(ruleId) {
  activeColSuggestRuleId.value = ruleId;
  const rule = localFilters.value.find((r) => r.id === ruleId);
  colSuggestIndex.value = colSuggestionsForRule(rule).length ? 0 : -1;
}

function closeColSuggest() {
  activeColSuggestRuleId.value = '';
  colSuggestIndex.value = -1;
}

function onColInput(ruleId, value) {
  updateRule(ruleId, { col: value });
  openColSuggest(ruleId);
}

function pickColSuggestion(ruleId, col) {
  updateRule(ruleId, { col });
  closeColSuggest();
}

function pickActiveColSuggest(ruleId) {
  const rule = localFilters.value.find((r) => r.id === ruleId);
  const list = colSuggestionsForRule(rule);
  if (colSuggestIndex.value >= 0 && list[colSuggestIndex.value]) {
    pickColSuggestion(ruleId, list[colSuggestIndex.value]);
    return;
  }
  closeColSuggest();
}

function moveColSuggest(step) {
  const rule = localFilters.value.find((r) => r.id === activeColSuggestRuleId.value);
  if (!rule) return;
  const list = colSuggestionsForRule(rule);
  if (!list.length) return;
  const next = colSuggestIndex.value + step;
  if (next < 0) colSuggestIndex.value = list.length - 1;
  else if (next >= list.length) colSuggestIndex.value = 0;
  else colSuggestIndex.value = next;
}

function onDocumentClick(e) {
  if (!e.target.closest('.filter-group-col-sm')) {
    closeColSuggest();
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onUnmounted(() => document.removeEventListener('click', onDocumentClick));

const keywordLabel = computed(() => '关键字');

const keywordPlaceholder = computed(() => {
  if (props.variant === 'qa') return '表名/数据项/问题描述';
  if (props.mode === 'aggregate') return '按模块搜索...';
  return '表名/数据项/说明';
});

function highlightName(name) {
  return highlightKeyword(name, props.keyword.trim());
}
</script>

<style scoped>
.filter-bar-wrap {
  margin-bottom: 12px;
}

.filter-bar-wrap.compact {
  margin-bottom: 0;
  overflow: visible;
}

.unified-filter-bar {
  margin-bottom: 0;
}

.filter-group-keyword {
  flex: 0 1 128px;
  min-width: 108px;
  max-width: 144px;
}

.filter-group-table {
  flex: 0 1 96px;
  min-width: 80px;
  max-width: 120px;
}

.filter-group-table select {
  min-width: 0;
  width: 100%;
  padding: 4px 6px !important;
  font-size: 12px !important;
}

.filter-input-compact {
  min-width: 0 !important;
  width: 100%;
  padding: 4px 5px !important;
  font-size: 12px !important;
}

.custom-filters-inline {
  display: flex;
  flex: 1 1 auto;
  align-items: flex-end;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 140px;
  overflow: visible;
}

.custom-filter-row-inline {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  flex-wrap: nowrap;
}

.custom-filter-index {
  width: 12px;
  text-align: center;
  font-size: 10px;
  color: var(--text-muted);
  padding-bottom: 6px;
  flex-shrink: 0;
}

.filter-group-col-sm {
  position: relative;
  flex: 0 1 96px;
  min-width: 76px;
  max-width: 116px;
}

.filter-group-col-sm input {
  padding: 4px 5px !important;
}

.filter-group-op {
  flex: 0 1 72px;
  min-width: 58px;
  max-width: 80px;
}

.filter-group-op select {
  min-width: 0;
  width: 100%;
  padding: 4px 5px !important;
  font-size: 12px !important;
}

.filter-group-val {
  flex: 0 1 84px;
  min-width: 66px;
  max-width: 100px;
}

.filter-group-val input {
  padding: 4px 5px !important;
}

.col-suggest {
  display: none;
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  max-height: 220px;
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  z-index: 200;
}

.col-suggest.show {
  display: block;
}

.col-suggest-item {
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text);
}

.col-suggest-item:hover,
.col-suggest-item.active {
  background: var(--bg-active);
}

.col-suggest-empty {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-muted);
}

.btn-icon {
  padding: 4px 8px;
  line-height: 1;
  font-size: 15px;
  color: var(--text-secondary);
  margin-bottom: 1px;
  flex-shrink: 0;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.filter-actions .btn-icon {
  padding: 4px 7px;
  font-size: 14px;
}

.btn-icon:hover {
  color: #b91c1c;
  border-color: #fecaca;
}

.filter-group-multi {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.custom-filter-row-multi {
  align-items: center;
}

.multi-select-field-name {
  flex-shrink: 0;
  max-width: 120px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text, #374151);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-bottom: 0;
  line-height: 28px;
}

.btn-add-filter {
  font-size: 11px;
  color: var(--accent-blue);
  border-style: dashed;
  padding: 4px 8px;
  margin-bottom: 1px;
  white-space: nowrap;
  flex-shrink: 0;
  height: 28px;
  display: inline-flex;
  align-items: center;
}

.q-suggest-item.active {
  background: var(--bg-active);
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

@media (max-width: 960px) {
  .filter-group-keyword {
    flex: 1 1 120px;
    max-width: none;
  }

  .custom-filters-inline {
    flex-basis: auto;
  }

  .filter-actions {
    margin-left: 0;
    flex-basis: auto;
    justify-content: flex-end;
  }
}

@media (max-width: 640px) {
  .filter-group-keyword,
  .filter-group-table,
  .filter-group-col-sm,
  .filter-group-op,
  .filter-group-val {
    flex: 1 1 100%;
    max-width: none;
    min-width: 0;
  }

  .filter-actions {
    flex-basis: auto;
    justify-content: flex-end;
  }
}
</style>
