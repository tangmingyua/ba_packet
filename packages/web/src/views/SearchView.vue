<template>
  <!-- 首页：居中搜索 -->
  <section v-if="showHomeCenter" class="home-center">
    <div class="home-logo">
      <div class="home-logo-icon">
        <svg viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <div class="home-logo-text">Pocket BA</div>
    </div>

    <div class="mode-tabs" role="tablist" aria-label="查询模式">
      <button
        v-for="tab in modeTabs"
        :key="tab.id"
        type="button"
        class="mode-tab"
        :class="{ active: searchMode === tab.id }"
        role="tab"
        :aria-selected="searchMode === tab.id"
        @click="setSearchMode(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <form class="search-container" @submit.prevent="doSearch">
      <svg
        class="search-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        v-model="keyword"
        type="search"
        class="search-box"
        :placeholder="searchPlaceholder"
        autocomplete="off"
        @input="onInput"
        @keydown.down.prevent="moveSuggest(1)"
        @keydown.up.prevent="moveSuggest(-1)"
        @keydown.enter.prevent="onEnter"
        @focus="onInput"
      />
      <button type="submit" class="search-btn" :disabled="loading">查询</button>

      <div v-if="showSuggest && suggestions.length" class="suggestions show">
        <div
          v-for="(item, index) in suggestions"
          :key="`${item.reportCode}-${item.tableName}-${item.dataItemName}`"
          class="suggestion-item"
          :class="{ active: index === suggestIndex }"
          @mousedown.prevent="pickSuggest(item)"
        >
          <div class="suggestion-title" v-html="suggestTitleHtml(item)" />
          <div class="suggestion-meta">
            表名：{{ item.tableName }} · {{ item.reportName }}
            <span v-if="item.moduleName" class="module-tag">{{ item.moduleName }}</span>
            <span v-if="item.categoryLabel" class="category-tag">{{ item.categoryLabel }}</span>
          </div>
        </div>
      </div>
      <div v-else-if="showSuggest && keyword.trim()" class="suggestions show">
        <div class="suggestion-empty">无匹配数据项</div>
      </div>
    </form>

    <CategoryTagFilter
      v-if="searchMode === 'aggregate'"
      v-model="aggregateCategories"
      variant="full"
      class="home-category-filter"
      @change="onAggregateCategoriesChange"
    />

    <p v-if="error" class="message error" style="margin-top: 16px">{{ error }}</p>
  </section>

  <!-- 结果页 -->
  <section v-else class="search-results">
    <template v-if="isQaLayout">
      <div v-if="moduleTabs.length" class="qa-module-tabs">
        <button
          v-for="mod in moduleTabs"
          :key="mod.code"
          type="button"
          class="qa-module-tab"
          :class="{ active: activeModuleCode === mod.code }"
          @click="activeModuleCode = mod.code"
        >
          {{ mod.name }} ({{ mod.hitCount }})
        </button>
      </div>

      <div v-if="filteredReports.length" class="qa-sheet-tabs">
        <button
          type="button"
          class="qa-sheet-tab"
          :class="{ active: activeReportCode === ALL_SUBTYPE }"
          @click="activeReportCode = ALL_SUBTYPE"
        >
          全部 ({{ moduleHitsTotal }})
        </button>
        <button
          v-for="report in filteredReports"
          :key="report.code"
          type="button"
          class="qa-sheet-tab"
          :class="{ active: activeReportCode === report.code }"
          :disabled="!report.hitCount"
          @click="activeReportCode = report.code"
        >
          {{ report.name }} ({{ report.hitCount }})
        </button>
      </div>
    </template>

    <ResultFilterBar
      :variant="isQaLayout ? 'qa' : 'norm'"
      :mode="searchMode"
      v-model:keyword="keyword"
      v-model:table-filter="tableFilter"
      v-model:custom-filters="customFilters"
      v-model:category-filter="aggregateCategories"
      :table-options="tableOptions"
      :column-options="columnOptions"
      :suggestions="filterSuggestions"
      :suggest-index="filterSuggestIndex"
      :show-suggest="filterShowSuggest"
      :loading="loading"
      @search="onFilterSearch"
      @reset="resetFilters"
      @suggest-pick="pickFilterSuggest"
      @suggest-nav="moveFilterSuggest"
      @suggest-show="onFilterSuggestInput"
      @suggest-hide="filterShowSuggest = false"
      @category-change="onAggregateCategoriesChange"
    />

    <p v-if="error" class="message error">{{ error }}</p>

    <div v-if="searched && lastKeyword" class="result-meta">
      <span>关键词「{{ lastKeyword }}」</span>
      <span v-if="elapsedMs">耗时 {{ elapsedMs }}ms</span>
      <span v-if="isQaLayout && activeReportCode !== ALL_SUBTYPE">
        当前子类 {{ displayTotal }} 条 / 主类合计 {{ moduleHitsTotal }} 条
      </span>
      <span v-else>共 {{ displayTotal }} 条</span>
    </div>

    <DynamicResultTable
      :rows="filteredRows"
      :column-meta="columnMeta"
      :keyword="lastKeyword"
      :title="tableTitle"
      :empty-text="emptyText"
    />
  </section>
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { searchRegulatory, suggestItems } from '../api';
import ResultFilterBar from '../components/search/ResultFilterBar.vue';
import DynamicResultTable from '../components/search/DynamicResultTable.vue';
import CategoryTagFilter from '../components/search/CategoryTagFilter.vue';
import { parseCategoryFilter } from '../constants/materialCategories.js';
import {
  buildColumnMeta,
  filterRows,
  flattenReport,
  flattenReports,
  getColumnOptions,
  getTableOptions,
  highlightKeyword,
  mergeFieldLabels,
  mergeFieldMappingDefaultDisplayByVersion,
  mergeFieldMappingOrdersByVersion,
  mergeFieldMappingsByVersion,
  normalizeActiveFilters,
} from '../composables/useDynamicTable.js';

const emit = defineEmits(['search-state']);

const route = useRoute();
const router = useRouter();
const homeResetSignal = inject('homeResetSignal', ref(0));
const pendingHomeMode = inject('pendingHomeMode', ref(null));

const homeMode = ref('norm');

const searchMode = computed(() => {
  if (searched.value) {
    const mode = route.query.mode;
    if (mode === 'norm' || mode === 'qa' || mode === 'aggregate') return mode;
    return homeMode.value;
  }
  return homeMode.value;
});

const isQaLayout = computed(() => searchMode.value === 'qa' || searchMode.value === 'aggregate');

const keyword = ref('');
const lastKeyword = ref('');
const suggestions = ref([]);
const suggestIndex = ref(-1);
const showSuggest = ref(false);
const loading = ref(false);
const searched = ref(false);
const showHomeCenter = computed(() => !searched.value);
const showResultsLayout = computed(() => searched.value);
const error = ref('');
const reports = ref([]);
const activeModuleCode = ref('');
const activeReportCode = ref('');
const elapsedMs = ref(0);
const aggregateCategories = ref([]);

const tableFilter = ref('__all__');
const customFilters = ref([]);
const appliedTableFilter = ref('__all__');
const appliedCustomFilters = ref([]);

const filterSuggestions = ref([]);
const filterSuggestIndex = ref(-1);
const filterShowSuggest = ref(false);
let suggestTimer = null;
let filterSuggestTimer = null;

const modeLabels = { norm: '查规范', qa: '查答疑', aggregate: '聚合查询' };

const VALID_SEARCH_MODES = ['norm', 'qa', 'aggregate'];

function isValidSearchMode(mode) {
  return VALID_SEARCH_MODES.includes(mode);
}

const modeTabs = [
  { id: 'norm', label: '查规范' },
  { id: 'qa', label: '查答疑' },
  { id: 'aggregate', label: '聚合查询' },
];

const modeConfig = {
  norm: { placeholder: '搜索数据项名称，如：贷款、客户、机构...' },
  qa: { placeholder: '搜索答疑问题或关键词...' },
  aggregate: { placeholder: '聚合搜索规范 + 答疑...' },
};

const searchPlaceholder = computed(
  () => modeConfig[searchMode.value]?.placeholder || modeConfig.norm.placeholder
);

/** 子类 Tab：全部 */
const ALL_SUBTYPE = '__all__';

watch(
  () => route.query.categories,
  (raw) => {
    aggregateCategories.value = parseCategoryFilter(raw);
  },
  { immediate: true }
);

watch(homeResetSignal, () => {
  resetAll();
  if (pendingHomeMode.value) {
    homeMode.value = pendingHomeMode.value;
    pendingHomeMode.value = null;
  }
});

watch(
  () => route.query.mode,
  (mode, prevMode) => {
    if (mode === prevMode) return;

    // 搜索成功后首次写入 URL mode，不应视为切换模式而重置首页
    if (searched.value && isValidSearchMode(mode) && !isValidSearchMode(prevMode)) {
      return;
    }

    if (searched.value && isValidSearchMode(mode) && isValidSearchMode(prevMode)) {
      keyword.value = '';
      lastKeyword.value = '';
      reports.value = [];
      activeModuleCode.value = '';
      activeReportCode.value = '';
      error.value = '';
      searched.value = false;
      resetLocalFilters();
      showSuggest.value = false;
      filterShowSuggest.value = false;
      applySearchFieldMappings({});
      return;
    }

    if (!searched.value) return;

    reports.value = [];
    error.value = '';
    resetLocalFilters();
    const q = keyword.value.trim() || lastKeyword.value.trim();
    if (q) {
      doSearch();
    } else {
      searched.value = false;
    }
  }
);

const activeReport = computed(
  () => filteredReports.value.find((r) => r.code === activeReportCode.value) || null
);

const moduleTabs = computed(() => {
  const map = new Map();
  for (const report of reports.value) {
    const code = report.moduleCode || 'YBT';
    if (!map.has(code)) {
      map.set(code, {
        code,
        name: report.moduleName || code,
        hitCount: 0,
      });
    }
    map.get(code).hitCount += report.hitCount || 0;
  }
  return [...map.values()];
});

const filteredReports = computed(() => {
  if (!activeModuleCode.value) return reports.value;
  return reports.value.filter((r) => (r.moduleCode || 'YBT') === activeModuleCode.value);
});

const moduleHitsTotal = computed(() =>
  filteredReports.value.reduce((sum, r) => sum + (r.hitCount || 0), 0)
);

watch(activeModuleCode, () => {
  activeReportCode.value = ALL_SUBTYPE;
});

watch(filteredReports, (list) => {
  if (!isQaLayout.value) return;
  if (activeReportCode.value === ALL_SUBTYPE) return;
  if (!list.some((r) => r.code === activeReportCode.value)) {
    activeReportCode.value = ALL_SUBTYPE;
  }
});

watch(
  [showResultsLayout, searchMode, homeMode, activeModuleCode, moduleTabs, isQaLayout],
  () => {
    const mod = moduleTabs.value.find((m) => m.code === activeModuleCode.value);
    const base = modeLabels[searchMode.value] || '查询';
    const title =
      isQaLayout.value && mod?.name ? `${base} · ${mod.name}` : `${base} · 查询结果`;
    emit('search-state', {
      layout: showResultsLayout.value,
      title,
      landingMode: homeMode.value,
    });
  },
  { immediate: true }
);

const baseRows = computed(() => {
  if (!reports.value.length) return [];
  if (isQaLayout.value) {
    if (activeReportCode.value === ALL_SUBTYPE) {
      return flattenReports(filteredReports.value, { mode: searchMode.value });
    }
    return flattenReport(activeReport.value, searchMode.value);
  }
  return flattenReports(reports.value, { mode: searchMode.value });
});

/** 可选筛选列：来自当前查询结果中有值的字段 */
const resultRowsForColumns = computed(() => {
  if (!reports.value.length) return [];
  if (isQaLayout.value) {
    return flattenReports(filteredReports.value, { mode: searchMode.value });
  }
  return flattenReports(reports.value, { mode: searchMode.value });
});

const tableOptions = computed(() => getTableOptions(baseRows.value));
const columnOptions = computed(() => getColumnOptions(resultRowsForColumns.value));

const filteredRows = computed(() =>
  filterRows(baseRows.value, {
    tableFilter: isQaLayout.value ? '__all__' : appliedTableFilter.value,
    customFilters: appliedCustomFilters.value,
  })
);

const columnMeta = computed(() => {
  const rows = filteredRows.value.length ? filteredRows.value : baseRows.value;
  const mode =
    searchMode.value === 'norm'
      ? 'norm'
      : searchMode.value === 'aggregate'
        ? 'aggregate'
        : 'qa';
  return buildColumnMeta(rows, mode);
});

const displayTotal = computed(() => filteredRows.value.length);

const tableTitle = computed(() => {
  if (isQaLayout.value) return searchMode.value === 'aggregate' ? '聚合数据' : '答疑数据';
  return '查询结果';
});

const emptyText = computed(() => {
  if (!searched.value) return '请输入关键字进行查询';
  if (!reports.value.length) return `未找到包含「${lastKeyword.value}」的数据项`;
  if (
    isQaLayout.value &&
    activeReportCode.value !== ALL_SUBTYPE &&
    !activeReport.value
  ) {
    return '请选择模块和数据表';
  }
  return '未找到匹配结果';
});

function resetLocalFilters() {
  tableFilter.value = '__all__';
  customFilters.value = [];
  appliedTableFilter.value = '__all__';
  appliedCustomFilters.value = [];
}

function applySearchFieldMappings(result) {
  mergeFieldMappingsByVersion(result?.fieldMappingsByVersion || {});
  mergeFieldMappingOrdersByVersion(result?.fieldMappingOrdersByVersion || {});
  mergeFieldMappingDefaultDisplayByVersion(result?.fieldMappingDefaultDisplayByVersion || {});
  mergeFieldLabels(result?.fieldLabels || {});
}

function resetAll() {
  keyword.value = '';
  lastKeyword.value = '';
  reports.value = [];
  activeModuleCode.value = '';
  activeReportCode.value = '';
  error.value = '';
  searched.value = false;
  homeMode.value = 'norm';
  resetLocalFilters();
  filterShowSuggest.value = false;
  showSuggest.value = false;
  aggregateCategories.value = [];
  applySearchFieldMappings({});
}

function onAggregateCategoriesChange() {
  if (searchMode.value === 'aggregate' && keyword.value.trim()) {
    if (showHomeCenter.value) {
      onInput();
    } else if (filterShowSuggest.value || keyword.value.trim()) {
      onFilterSuggestInput();
    }
  }
  if (searched.value && lastKeyword.value.trim()) {
    doSearch();
  }
}

function buildSearchQuery() {
  const query = { mode: searchMode.value };
  if (searchMode.value === 'aggregate' && aggregateCategories.value.length) {
    query.categories = aggregateCategories.value.join(',');
  }
  return query;
}

function setSearchMode(mode) {
  if (mode === homeMode.value) {
    showSuggest.value = false;
    return;
  }
  homeMode.value = mode;
  showSuggest.value = false;
  suggestions.value = [];
  suggestIndex.value = -1;
  error.value = '';
}

function suggestTitleHtml(item) {
  const name = item.dataItemName || '';
  const q = keyword.value.trim();
  if (!q) return name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return highlightKeyword(name, q);
}

function resetFilters() {
  keyword.value = '';
  lastKeyword.value = '';
  reports.value = [];
  error.value = '';
  searched.value = false;
  resetLocalFilters();
  filterShowSuggest.value = false;
  aggregateCategories.value = [];
  applySearchFieldMappings({});
}

function onFilterSearch() {
  appliedTableFilter.value = tableFilter.value;
  appliedCustomFilters.value = normalizeActiveFilters(customFilters.value);
  filterShowSuggest.value = false;
  const q = keyword.value.trim();
  if (q && q !== lastKeyword.value) {
    doSearch();
  }
}

function onInput() {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(loadSuggest, 200);
}

function onFilterSuggestInput() {
  clearTimeout(filterSuggestTimer);
  filterSuggestTimer = setTimeout(loadFilterSuggest, 200);
}

async function loadSuggest() {
  const q = keyword.value.trim();
  if (!q) {
    suggestions.value = [];
    showSuggest.value = false;
    return;
  }
  try {
    const { items } = await suggestItems(q, 10, searchMode.value, {
      categories: searchMode.value === 'aggregate' ? aggregateCategories.value : undefined,
    });
    suggestions.value = items;
    suggestIndex.value = items.length ? 0 : -1;
    showSuggest.value = true;
  } catch {
    suggestions.value = [];
    showSuggest.value = false;
  }
}

async function loadFilterSuggest() {
  const q = keyword.value.trim();
  if (!q) {
    filterSuggestions.value = [];
    filterShowSuggest.value = false;
    return;
  }
  try {
    const { items } = await suggestItems(q, 10, searchMode.value, {
      categories: searchMode.value === 'aggregate' ? aggregateCategories.value : undefined,
    });
    filterSuggestions.value = items;
    filterSuggestIndex.value = items.length ? 0 : -1;
    filterShowSuggest.value = true;
  } catch {
    filterSuggestions.value = [];
    filterShowSuggest.value = false;
  }
}

function moveSuggest(step) {
  if (!suggestions.value.length) return;
  const next = suggestIndex.value + step;
  if (next < 0) suggestIndex.value = suggestions.value.length - 1;
  else if (next >= suggestions.value.length) suggestIndex.value = 0;
  else suggestIndex.value = next;
}

function moveFilterSuggest(step) {
  if (!filterSuggestions.value.length) return;
  const next = filterSuggestIndex.value + step;
  if (next < 0) filterSuggestIndex.value = filterSuggestions.value.length - 1;
  else if (next >= filterSuggestions.value.length) filterSuggestIndex.value = 0;
  else filterSuggestIndex.value = next;
}

function pickSuggest(item) {
  keyword.value = item.dataItemName;
  showSuggest.value = false;
  doSearch();
}

function pickFilterSuggest(item) {
  keyword.value = item.dataItemName;
  filterShowSuggest.value = false;
  onFilterSearch();
}

function onEnter() {
  if (showSuggest.value && suggestIndex.value >= 0) {
    pickSuggest(suggestions.value[suggestIndex.value]);
    return;
  }
  doSearch();
}

function pickDefaultTabs() {
  if (!reports.value.length) {
    activeModuleCode.value = '';
    activeReportCode.value = '';
    return;
  }
  activeModuleCode.value = reports.value[0].moduleCode || 'YBT';
  activeReportCode.value = ALL_SUBTYPE;
}

async function doSearch() {
  const q = keyword.value.trim();
  if (!q) {
    error.value = '请输入搜索关键词';
    return;
  }

  showSuggest.value = false;
  filterShowSuggest.value = false;
  loading.value = true;
  error.value = '';

  const start = performance.now();
  try {
    const result = await searchRegulatory(q, searchMode.value, {
      categories: searchMode.value === 'aggregate' ? aggregateCategories.value : undefined,
    });
    elapsedMs.value = Math.round(performance.now() - start);
    if (result.error) {
      error.value = result.error;
      reports.value = [];
      searched.value = false;
      applySearchFieldMappings({});
      return;
    }
    lastKeyword.value = result.keyword;
    applySearchFieldMappings(result);
    reports.value = result.reports;
    pickDefaultTabs();
    appliedTableFilter.value = tableFilter.value;
    appliedCustomFilters.value = normalizeActiveFilters(customFilters.value);
    await router.replace({ path: '/', query: buildSearchQuery() });
    searched.value = true;
  } catch (e) {
    searched.value = false;
    error.value = e.message || '搜索失败';
    reports.value = [];
    applySearchFieldMappings({});
  } finally {
    loading.value = false;
  }
}

function onDocumentClick(e) {
  if (!e.target.closest('.filter-group')) {
    filterShowSuggest.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  const mode = route.query.mode;
  if (!searched.value && (mode === 'norm' || mode === 'qa' || mode === 'aggregate')) {
    homeMode.value = mode;
  }
});
onUnmounted(() => document.removeEventListener('click', onDocumentClick));
</script>

<style scoped>
.search-results {
  max-width: 100%;
}

.category-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: var(--sidebar-active-bg, #e5e7eb);
  color: var(--text-secondary, #6b7280);
}

.home-category-filter {
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
}

.module-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: var(--bg-hover, #f3f4f6);
  color: var(--text-primary, #374151);
}
</style>
