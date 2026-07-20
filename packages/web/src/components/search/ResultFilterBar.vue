<template>
  <div class="filter-bar-wrap">
    <div :class="['unified-filter-bar', variant === 'qa' ? 'qa-filter-bar' : 'filter-bar']">
      <div class="filter-group filter-group-keyword">
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
              :key="`${item.reportCode}-${item.tableName}-${item.dataItemName}-${index}`"
              class="q-suggest-item"
              :class="{ active: index === suggestIndex }"
              @mousedown.prevent="emit('suggest-pick', item)"
            >
              <span v-html="highlightName(item.dataItemName)" />
              <span class="q-table">{{ item.tableName }}</span>
            </div>
          </template>
          <div v-else-if="keyword.trim()" class="q-suggest-empty">无匹配结果</div>
        </div>
      </div>

      <div v-if="variant === 'norm'" class="filter-group filter-group-table">
        <label>{{ tableLabel }}</label>
        <select :value="tableFilter" @change="emit('update:tableFilter', ($event.target).value)">
          <option value="__all__">全部</option>
          <option v-for="opt in tableOptions" :key="opt.name" :value="opt.name">
            {{ opt.name }} ({{ opt.count }})
          </option>
        </select>
      </div>

      <div class="custom-filters-inline">
        <span v-if="localFilters.length" class="custom-filters-label">自定义筛选</span>

        <div
          v-for="(rule, index) in localFilters"
          :key="rule.id"
          class="custom-filter-row-inline"
        >
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

        <button type="button" class="btn btn-add-filter" @click="addRule">
          {{ localFilters.length ? '+ 添加条件' : '+ 自定义筛选' }}
        </button>
      </div>

      <div class="filter-actions">
        <button type="button" class="btn btn-primary" :disabled="loading" @click="emit('search')">
          查询
        </button>
        <button type="button" class="btn" @click="emit('reset')">重置</button>
      </div>
    </div>

    <CategoryTagFilter
      v-if="mode === 'aggregate'"
      :model-value="categoryFilter"
      variant="full"
      class="filter-category-row"
      @update:model-value="emit('update:categoryFilter', $event)"
      @change="emit('category-change', $event)"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  FILTER_OPERATORS,
  NO_VALUE_OPERATORS,
  createFilterRule,
  filterColumnSuggestions,
  highlightKeyword,
} from '../../composables/useDynamicTable.js';
import CategoryTagFilter from './CategoryTagFilter.vue';

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
  categoryFilter: { type: Array, default: () => [] },
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
  'update:categoryFilter',
  'category-change',
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

function syncFilters() {
  emit('update:customFilters', localFilters.value.map((r) => ({ ...r })));
}

function updateRule(id, patch) {
  localFilters.value = localFilters.value.map((r) => (r.id === id ? { ...r, ...patch } : r));
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
  if (props.mode === 'aggregate') return '聚合搜索...';
  return '表名/数据项/说明';
});

const tableLabel = computed(() => (props.mode === 'aggregate' ? '来源' : '表名'));

function highlightName(name) {
  return highlightKeyword(name, props.keyword.trim());
}
</script>

<style scoped>
.filter-bar-wrap {
  margin-bottom: 12px;
}

.filter-category-row {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
  width: 100%;
}

.unified-filter-bar {
  margin-bottom: 0;
}

.filter-group-keyword {
  flex: 0 1 168px;
  min-width: 140px;
  max-width: 180px;
}

.filter-group-table {
  flex: 0 1 120px;
  min-width: 100px;
  max-width: 140px;
}

.filter-group-table select {
  min-width: 0;
  width: 100%;
  padding: 5px 8px !important;
  font-size: 12px !important;
}

.filter-input-compact {
  min-width: 0 !important;
  width: 100%;
  padding: 5px 8px !important;
  font-size: 12px !important;
}

.custom-filters-inline {
  display: flex;
  flex: 1 1 auto;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 200px;
}

.custom-filters-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-bottom: 8px;
  flex-shrink: 0;
}

.custom-filter-row-inline {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  flex-wrap: nowrap;
}

.custom-filter-index {
  width: 14px;
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  padding-bottom: 8px;
  flex-shrink: 0;
}

.filter-group-col-sm {
  position: relative;
  flex: 0 1 120px;
  min-width: 96px;
  max-width: 140px;
}

.filter-group-op {
  flex: 0 1 88px;
  min-width: 72px;
  max-width: 96px;
}

.filter-group-op select {
  min-width: 0;
  width: 100%;
  padding: 5px 6px !important;
  font-size: 12px !important;
}

.filter-group-val {
  flex: 0 1 100px;
  min-width: 80px;
  max-width: 120px;
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
  z-index: 30;
}

.col-suggest.show {
  display: block;
}

.col-suggest-item {
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text);
}

.col-suggest-item:hover,
.col-suggest-item.active {
  background: var(--bg-active);
}

.col-suggest-empty {
  padding: 8px 12px;
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
}

.btn-icon:hover {
  color: #b91c1c;
  border-color: #fecaca;
}

.btn-add-filter {
  font-size: 12px;
  color: var(--accent-blue);
  border-style: dashed;
  padding: 5px 10px;
  margin-bottom: 1px;
  white-space: nowrap;
  flex-shrink: 0;
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
    flex: 1 1 140px;
    max-width: none;
  }

  .custom-filters-inline {
    flex-basis: 100%;
  }

  .filter-actions {
    margin-left: 0;
    flex-basis: 100%;
    justify-content: flex-end;
  }
}
</style>
