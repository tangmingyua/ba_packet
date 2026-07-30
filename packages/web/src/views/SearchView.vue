<template>
  <section
    class="search-page"
    :class="{
      'search-page-landing': !searched,
      'search-page-compact': searched && isAggregateMode,
    }"
  >
    <!-- 新头部：模块 + 标签卡片 + 搜索 -->
    <header class="search-page-header">
      <div class="header-top">
        <div class="header-title-block">
          <h1 class="module-title">{{ moduleLabel }}</h1>
        </div>
        <label v-if="modules.length > 1" class="module-picker field compact">
          <span class="label">主类</span>
          <select v-model="moduleCode" @change="onModuleChange">
            <option v-for="m in modules" :key="m.code" :value="m.code">{{ m.name }}</option>
          </select>
        </label>
      </div>

      <ModuleCategoryCards
        v-if="categoryStats.length"
        v-model="selectedCategories"
        :options="categoryStats"
        @change="onCategoriesChange"
      />

      <SubtypeTabs
        v-if="showSubtypeTabs"
        v-model="selectedSubtypeCode"
        :options="subtypeStats"
        @change="onSubtypeChange"
      />

      <form class="header-search" @submit.prevent="doSearch">
        <input
          v-model="keyword"
          type="search"
          class="header-search-input"
          :placeholder="searchPlaceholder"
          autocomplete="off"
          @input="onInput"
          @keydown.down.prevent="moveSuggest(1)"
          @keydown.up.prevent="moveSuggest(-1)"
          @keydown.enter.prevent="onEnter"
          @focus="onInput"
        />
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? '查询中…' : '查询' }}
        </button>
        <div v-if="showSuggest && suggestions.length" class="header-suggestions show">
          <div
            v-for="(item, index) in suggestions"
            :key="`${item.reportCode}-${item.tableName}-${item.dataItemName}-${index}`"
            class="suggestion-item"
            :class="{ active: index === suggestIndex }"
            @mousedown.prevent="pickSuggest(item)"
          >
            <div class="suggestion-title" v-html="suggestTitleHtml(item)" />
            <div class="suggestion-meta">
              表名：{{ item.tableName }} · {{ item.reportName }}
              <span v-if="item.categoryLabel" class="category-tag">{{ item.categoryLabel }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="showSuggest && keyword.trim()" class="header-suggestions show">
          <div class="suggestion-empty">无匹配数据项</div>
        </div>
      </form>
    </header>

    <!-- 结果区 -->
    <section v-if="searched" class="search-results">
      <ResultFilterBar
        v-if="showResultFilterBar"
        :variant="isQaLayout ? 'qa' : 'norm'"
        :mode="searchMode"
        :hide-keyword="isAggregateMode"
        :compact="isAggregateMode"
        v-model:keyword="keyword"
        v-model:table-filter="tableFilter"
        v-model:custom-filters="customFilters"
        v-model:category-filter="selectedCategories"
        :category-options="[]"
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
      />

      <p v-if="error" class="message error">{{ error }}</p>

      <!-- 聚合查询：按所选子类 storageKind 切换渲染 -->
      <template v-if="useSubtypeScopedRender">
        <DynamicResultTable
          v-if="selectedStorageKind === 'excel'"
          :rows="filteredRows"
          :column-meta="columnMeta"
          :keyword="lastKeyword"
          :title="subtypeResultTitle"
          :empty-text="emptyText"
        />

        <CodeValueResultTable
          v-else-if="selectedStorageKind === 'code_value'"
          :reports="materialReports"
          :keyword="lastKeyword"
          :title="subtypeResultTitle"
          :empty-text="emptyText"
        />

        <FormTemplateResultPanel
          v-else-if="selectedStorageKind === 'form_template'"
          :keyword="lastKeyword"
          :module-code="moduleCode"
          :empty-text="emptyText"
        />

        <DocumentResultPanel
          v-else-if="selectedStorageKind === 'document'"
          :keyword="lastKeyword"
          :module-code="moduleCode"
          :subtype-code="selectedSubtypeCode"
          :empty-text="emptyText"
        />

        <UnifiedMaterialHitList
          v-else-if="isMaterialStorageKind && materialReports.length"
          :reports="materialReports"
          :title="subtypeResultTitle"
        />

        <p
          v-else-if="isMaterialStorageKind && !materialReports.length"
          class="message muted"
        >
          {{ emptyText }}
        </p>

        <p v-else-if="selectedStorageKind" class="message muted">
          暂不支持「{{ selectedSubtypeLabel }}」类型的结果展示
        </p>
      </template>

      <!-- 非子类限定模式（查规范 / 查答疑等） -->
      <template v-else>
        <DynamicResultTable
          v-if="datasetReports.length"
          :rows="filteredRows"
          :column-meta="columnMeta"
          :keyword="lastKeyword"
          :title="tableTitle"
          :empty-text="emptyText"
        />

        <UnifiedMaterialHitList
          v-if="materialReports.length"
          :reports="materialReports"
          :title="materialHitTitle"
        />

        <p
          v-if="searched && !datasetReports.length && !materialReports.length"
          class="message muted"
        >
          {{ emptyText }}
        </p>
      </template>
    </section>

    <p v-else-if="error" class="message error header-error">{{ error }}</p>
  </section>
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getDatasetCatalog,
  getModuleCategoryStats,
  getModuleSubtypeStats,
  searchRegulatory,
  suggestItems,
} from '../api';
import ResultFilterBar from '../components/search/ResultFilterBar.vue';
import DynamicResultTable from '../components/search/DynamicResultTable.vue';
import CodeValueResultTable from '../components/search/CodeValueResultTable.vue';
import FormTemplateResultPanel from '../components/search/FormTemplateResultPanel.vue';
import DocumentResultPanel from '../components/search/DocumentResultPanel.vue';
import UnifiedMaterialHitList from '../components/search/UnifiedMaterialHitList.vue';
import ModuleCategoryCards from '../components/search/ModuleCategoryCards.vue';
import SubtypeTabs from '../components/search/SubtypeTabs.vue';
import { parseCategoryFilter } from '../constants/materialCategories.js';
import {
  buildColumnMeta,
  createFilterRule,
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

const homeMode = ref('aggregate');
const modules = ref([]);
const moduleCode = ref('');
const categoryStats = ref([]);
const selectedCategories = ref([]);
const subtypeStats = ref([]);
const selectedSubtypeCode = ref('');

const keyword = ref('');
const lastKeyword = ref('');
const suggestions = ref([]);
const suggestIndex = ref(-1);
const showSuggest = ref(false);
const loading = ref(false);
const searched = ref(false);
const error = ref('');
const reports = ref([]);
const activeReportCode = ref('');
const elapsedMs = ref(0);

const tableFilter = ref('__all__');
const customFilters = ref([]);
const appliedTableFilter = ref('__all__');
const appliedCustomFilters = ref([]);

const filterSuggestions = ref([]);
const filterSuggestIndex = ref(-1);
const filterShowSuggest = ref(false);
let suggestTimer = null;
let filterSuggestTimer = null;

const VALID_SEARCH_MODES = ['norm', 'qa', 'aggregate'];
const MODE_TO_CATEGORIES = {
  norm: ['norm'],
  qa: ['qa'],
  aggregate: [],
};

const modeLabels = { norm: '查规范', qa: '查答疑', aggregate: '聚合查询' };

const modeConfig = {
  norm: { placeholder: '搜索数据项名称，如：贷款、客户、机构...' },
  qa: { placeholder: '搜索答疑问题或关键词...' },
  aggregate: { placeholder: '聚合搜索规范、答疑、表样、说明、脚本、码值...' },
};

const searchMode = computed(() => {
  if (searched.value) {
    const mode = route.query.mode;
    if (mode === 'norm' || mode === 'qa' || mode === 'aggregate') return mode;
    return homeMode.value;
  }
  return homeMode.value;
});

const isQaLayout = computed(() => searchMode.value === 'qa' || searchMode.value === 'aggregate');

const searchPlaceholder = computed(
  () => modeConfig[searchMode.value]?.placeholder || modeConfig.aggregate.placeholder
);

const isAggregateMode = computed(() => effectiveSearchMode() === 'aggregate');

const showSubtypeTabs = computed(
  () => isAggregateMode.value && subtypeStats.value.length > 0
);

const moduleLabel = computed(
  () => modules.value.find((m) => m.code === moduleCode.value)?.name || moduleCode.value || ''
);

const selectedSubtypeMeta = computed(() =>
  subtypeStats.value.find((s) => s.code === selectedSubtypeCode.value) || null
);

const selectedSubtypeLabel = computed(() => {
  if (!selectedSubtypeCode.value) return '';
  return selectedSubtypeMeta.value?.name || selectedSubtypeCode.value;
});

const selectedStorageKind = computed(() => selectedSubtypeMeta.value?.storageKind || '');

const useSubtypeScopedRender = computed(
  () => isAggregateMode.value && Boolean(selectedSubtypeCode.value && selectedStorageKind.value)
);

const MATERIAL_STORAGE_KINDS = new Set(['script']);

const isMaterialStorageKind = computed(() =>
  MATERIAL_STORAGE_KINDS.has(selectedStorageKind.value)
);

const SUBTYPE_RESULT_TITLES = {
  excel: '配置类数据',
  form_template: '表样命中',
  document: '填报说明命中',
  script: '脚本命中',
  code_value: '码值',
};

const subtypeResultTitle = computed(() => {
  const kind = selectedStorageKind.value;
  if (kind && SUBTYPE_RESULT_TITLES[kind]) return SUBTYPE_RESULT_TITLES[kind];
  return selectedSubtypeLabel.value || tableTitle.value;
});

const showResultFilterBar = computed(() => {
  if (useSubtypeScopedRender.value) {
    return selectedStorageKind.value === 'excel';
  }
  return true;
});

const ALL_SUBTYPE = '__all__';

watch(
  () => route.query.categories,
  (raw) => {
    selectedCategories.value = parseCategoryFilter(raw);
  },
  { immediate: true }
);

watch(
  () => route.query.subtypeCode,
  (raw) => {
    selectedSubtypeCode.value = raw ? String(raw).split(/[,，]/)[0].trim() : '';
  },
  { immediate: true }
);

function ensureSubtypeSelection() {
  if (!subtypeStats.value.length) {
    selectedSubtypeCode.value = '';
    return;
  }
  if (
    !selectedSubtypeCode.value ||
    !subtypeStats.value.some((s) => s.code === selectedSubtypeCode.value)
  ) {
    selectedSubtypeCode.value = subtypeStats.value[0].code;
  }
}

watch(homeResetSignal, () => {
  resetAll();
  if (pendingHomeMode.value) {
    applySidebarMode(pendingHomeMode.value);
    pendingHomeMode.value = null;
  }
});

watch(
  () => route.query.mode,
  (mode, prevMode) => {
    if (mode === prevMode) return;
    if (searched.value && VALID_SEARCH_MODES.includes(mode) && !VALID_SEARCH_MODES.includes(prevMode)) {
      return;
    }
    if (searched.value && VALID_SEARCH_MODES.includes(mode) && VALID_SEARCH_MODES.includes(prevMode)) {
      keyword.value = '';
      lastKeyword.value = '';
      reports.value = [];
      activeReportCode.value = '';
      error.value = '';
      searched.value = false;
      resetLocalFilters();
      showSuggest.value = false;
      filterShowSuggest.value = false;
      applySearchFieldMappings({});
      applySidebarMode(mode);
      return;
    }
    if (!searched.value && VALID_SEARCH_MODES.includes(mode)) {
      applySidebarMode(mode);
    }
  }
);

const filteredReports = computed(() => {
  if (!moduleCode.value) return reports.value;
  return reports.value.filter((r) => (r.moduleCode || 'YBT') === moduleCode.value);
});

const datasetReports = computed(() => {
  let list = reports.value.filter((r) => !r.layout || r.layout === 'dataset');
  if (moduleCode.value) {
    list = list.filter((r) => (r.moduleCode || 'YBT') === moduleCode.value);
  }
  return list;
});

const materialReports = computed(() => {
  let list = reports.value.filter((r) => r.layout && r.layout !== 'dataset');
  if (moduleCode.value) {
    list = list.filter((r) => (r.moduleCode || '') === moduleCode.value);
  }
  return list;
});

const materialHitCount = computed(() => {
  let n = 0;
  for (const r of materialReports.value) {
    for (const b of r.blocks || []) {
      n += (b.items || []).length;
    }
  }
  return n;
});

const moduleHitsTotal = computed(() =>
  filteredReports.value.reduce((sum, r) => sum + (r.hitCount || 0), 0)
);

watch(filteredReports, (list) => {
  if (!isQaLayout.value) return;
  if (activeReportCode.value === ALL_SUBTYPE) return;
  if (!list.some((r) => r.code === activeReportCode.value)) {
    activeReportCode.value = ALL_SUBTYPE;
  }
});

watch(
  [() => searched.value, searchMode, moduleCode, filteredReports, isQaLayout],
  () => {
    const base = modeLabels[searchMode.value] || '查询';
    const title = moduleLabel.value ? `${base} · ${moduleLabel.value}` : `${base} · 查询结果`;
    emit('search-state', {
      layout: searched.value,
      title,
      landingMode: homeMode.value,
    });
  },
  { immediate: true }
);

const activeReport = computed(
  () => filteredReports.value.find((r) => r.code === activeReportCode.value) || null
);

const baseRows = computed(() => {
  if (!reports.value.length) return [];
  if (isQaLayout.value) {
    if (activeReportCode.value === ALL_SUBTYPE) {
      return flattenReports(filteredReports.value, { mode: searchMode.value });
    }
    return flattenReport(activeReport.value, searchMode.value);
  }
  const scope = moduleCode.value
    ? reports.value.filter((r) => (r.moduleCode || 'YBT') === moduleCode.value)
    : reports.value;
  return flattenReports(scope, { mode: searchMode.value });
});

const resultRowsForColumns = computed(() => {
  if (!reports.value.length) return [];
  if (isQaLayout.value) {
    return flattenReports(filteredReports.value, { mode: searchMode.value });
  }
  const scope = moduleCode.value
    ? reports.value.filter((r) => (r.moduleCode || 'YBT') === moduleCode.value)
    : reports.value;
  return flattenReports(scope, { mode: searchMode.value });
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

const resultTotalCount = computed(() => {
  if (useSubtypeScopedRender.value) {
    if (selectedStorageKind.value === 'excel') return displayTotal.value;
    return materialHitCount.value;
  }
  return displayTotal.value + materialHitCount.value;
});

const tableTitle = computed(() => {
  if (isQaLayout.value) return searchMode.value === 'aggregate' ? '聚合数据' : '答疑数据';
  return '查询结果';
});

const materialHitTitle = computed(() => {
  if (searchMode.value === 'norm') return '表样 / 说明命中';
  return '表样 / 说明 / 脚本 / 码值';
});

const emptyText = computed(() => {
  if (!searched.value) return '留空关键词并查询可浏览全部资料';
  if (!reports.value.length) {
    return lastKeyword.value ? `未找到包含「${lastKeyword.value}」的数据` : '当前条件下暂无资料';
  }
  if (
    isQaLayout.value &&
    activeReportCode.value !== ALL_SUBTYPE &&
    !activeReport.value
  ) {
    return '请选择子类';
  }
  return '未找到匹配结果';
});

function effectiveSearchMode() {
  const sel = selectedCategories.value;
  const mode = searchMode.value;
  if (mode === 'aggregate') return 'aggregate';
  if (!sel.length) return mode;
  const preset = MODE_TO_CATEGORIES[mode] || [];
  const matchesPreset =
    sel.length === preset.length && sel.every((c) => preset.includes(c));
  return matchesPreset ? mode : 'aggregate';
}

function syncModeFromCategorySelection() {
  if (effectiveSearchMode() === 'aggregate' && homeMode.value !== 'aggregate') {
    homeMode.value = 'aggregate';
  }
}

function searchApiOptions() {
  const mode = effectiveSearchMode();
  const opts = {
    moduleCode: moduleCode.value || undefined,
  };
  if (mode === 'aggregate' && selectedSubtypeCode.value) {
    opts.subtypeCode = selectedSubtypeCode.value;
  } else if (selectedCategories.value.length) {
    opts.categories = selectedCategories.value;
  }
  return opts;
}

function applySidebarMode(mode) {
  if (!VALID_SEARCH_MODES.includes(mode)) return;
  homeMode.value = mode;
  selectedCategories.value = [...(MODE_TO_CATEGORIES[mode] || [])];
  if (mode !== 'aggregate') {
    selectedSubtypeCode.value = '';
  }
}

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

function applyDefaultFilterColumns(result) {
  const byVersion = result?.fieldMappingDefaultFilterByVersion || {};
  const cols = [];
  const seen = new Set();
  for (const vid of Object.keys(byVersion).sort()) {
    for (const col of byVersion[vid] || []) {
      if (col && !seen.has(col)) {
        seen.add(col);
        cols.push(col);
      }
    }
  }
  customFilters.value = cols.map((col) => createFilterRule({ col, op: 'contains', val: '' }));
}

function resetAll() {
  keyword.value = '';
  lastKeyword.value = '';
  reports.value = [];
  activeReportCode.value = '';
  error.value = '';
  searched.value = false;
  homeMode.value = 'aggregate';
  resetLocalFilters();
  filterShowSuggest.value = false;
  showSuggest.value = false;
  selectedCategories.value = [];
  selectedSubtypeCode.value = '';
  subtypeStats.value = [];
  applySearchFieldMappings({});
}

function buildSearchQuery() {
  const mode = effectiveSearchMode();
  const query = {
    mode,
    moduleCode: moduleCode.value || undefined,
  };
  if (mode === 'aggregate' && selectedCategories.value.length) {
    query.categories = selectedCategories.value.join(',');
  }
  if (mode === 'aggregate' && selectedSubtypeCode.value) {
    query.subtypeCode = selectedSubtypeCode.value;
  }
  if (lastKeyword.value) query.q = lastKeyword.value;
  return query;
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
  applySearchFieldMappings({});
}

function onCategoriesChange() {
  syncModeFromCategorySelection();
  refreshSubtypeStats().then(() => {
    if (searched.value) {
      doSearch();
    } else if (keyword.value.trim()) {
      onInput();
    }
  });
}

function onSubtypeChange() {
  if (searched.value) {
    doSearch();
  } else if (keyword.value.trim()) {
    onInput();
  }
}

async function refreshSubtypeStats() {
  if (!moduleCode.value || effectiveSearchMode() !== 'aggregate') {
    subtypeStats.value = [];
    selectedSubtypeCode.value = '';
    return;
  }
  try {
    const { items } = await getModuleSubtypeStats(
      moduleCode.value,
      selectedCategories.value.length ? selectedCategories.value : undefined
    );
    subtypeStats.value = items || [];
    ensureSubtypeSelection();
  } catch {
    subtypeStats.value = [];
    selectedSubtypeCode.value = '';
  }
}

async function loadModules() {
  const catalog = await getDatasetCatalog();
  modules.value = catalog.modules || [];
  if (!moduleCode.value && modules.value.length) {
    moduleCode.value =
      route.query.moduleCode ||
      modules.value.find((m) => m.code === 'YBT')?.code ||
      modules.value[0].code;
  }
}

async function refreshCategoryStats() {
  if (!moduleCode.value) return;
  try {
    const { items } = await getModuleCategoryStats(moduleCode.value);
    categoryStats.value = items || [];
    const allowed = new Set(categoryStats.value.map((c) => c.code));
    if (selectedCategories.value.length) {
      selectedCategories.value = selectedCategories.value.filter((c) => allowed.has(c));
    }
  } catch {
    categoryStats.value = [];
  }
}

function onModuleChange() {
  refreshCategoryStats()
    .then(() => refreshSubtypeStats())
    .then(() => {
      if (searched.value) {
        doSearch();
      }
    });
}

function onFilterSearch() {
  appliedTableFilter.value = tableFilter.value;
  appliedCustomFilters.value = normalizeActiveFilters(customFilters.value);
  filterShowSuggest.value = false;
  const q = keyword.value.trim();
  if (q !== lastKeyword.value) {
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
    const { items } = await suggestItems(q, 10, effectiveSearchMode(), searchApiOptions());
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
    const { items } = await suggestItems(q, 10, effectiveSearchMode(), searchApiOptions());
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
  if (!filteredReports.value.length) {
    activeReportCode.value = ALL_SUBTYPE;
    return;
  }
  activeReportCode.value = ALL_SUBTYPE;
}

async function doSearch() {
  if (effectiveSearchMode() === 'aggregate' && subtypeStats.value.length) {
    ensureSubtypeSelection();
    if (!selectedSubtypeCode.value) {
      error.value = '请选择子类';
      return;
    }
  }

  const q = keyword.value.trim();

  showSuggest.value = false;
  filterShowSuggest.value = false;
  loading.value = true;
  error.value = '';

  const start = performance.now();
  try {
    const result = await searchRegulatory(q, effectiveSearchMode(), searchApiOptions());
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
    applyDefaultFilterColumns(result);
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
  if (!e.target.closest('.filter-group') && !e.target.closest('.header-search')) {
    filterShowSuggest.value = false;
    showSuggest.value = false;
  }
}

watch(
  () => route.query.moduleCode,
  (code) => {
    if (code && code !== moduleCode.value) {
      moduleCode.value = String(code);
      refreshCategoryStats();
      refreshSubtypeStats();
    }
  }
);

onMounted(async () => {
  document.addEventListener('click', onDocumentClick);
  const mode = route.query.mode;
  if (mode === 'norm' || mode === 'qa' || mode === 'aggregate') {
    applySidebarMode(mode);
  } else if (pendingHomeMode.value) {
    applySidebarMode(pendingHomeMode.value);
    pendingHomeMode.value = null;
  }
  await loadModules();
  await refreshCategoryStats();
  await refreshSubtypeStats();
  if (route.query.q !== undefined) {
    keyword.value = String(route.query.q);
    doSearch();
  }
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  emit('search-state', { layout: false, landingMode: homeMode.value });
});
</script>

<style scoped>
.search-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 100%;
  padding-bottom: 24px;
}

.search-page-landing {
  flex: 1;
  min-height: 100%;
  gap: 0;
  padding-bottom: 0;
}

.search-page-landing .search-page-header {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 28px;
  padding: 16px 0 40px;
  border-bottom: none;
}

.search-page-landing .module-title {
  font-size: clamp(28px, 3.2vw, 38px);
}

.search-page-landing .header-sub {
  font-size: 15px;
  margin-top: 8px;
}

.search-page-landing .header-search {
  width: 100%;
  max-width: none;
}

.search-page-landing .header-search-input {
  flex: 1 1 320px;
  padding: 14px 18px;
  font-size: 16px;
}

.search-page-landing .header-search .btn-primary {
  padding: 14px 28px;
  font-size: 15px;
}

.search-page-landing :deep(.cards-row) {
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 16px;
}

.search-page-landing :deep(.category-card) {
  min-height: 132px;
  padding: 18px 12px 16px;
  border-radius: 14px;
}

.search-page-landing :deep(.card-icon) {
  width: 48px;
  height: 48px;
  font-size: 19px;
}

.search-page-landing :deep(.card-label) {
  font-size: 14px;
}

.search-page-landing :deep(.card-count) {
  font-size: 26px;
}

.search-page-landing :deep(.subtype-tabs-wrap) {
  margin-top: 4px;
}

.search-page-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.header-title-block {
  min-width: 0;
}

.module-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
}

.header-sub {
  margin: 4px 0 0;
  font-size: 13px;
}

.module-picker {
  min-width: 160px;
}

.header-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.header-search-input {
  flex: 1 1 240px;
  min-width: 200px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 14px;
}

.header-suggestions {
  position: absolute;
  left: 0;
  right: 120px;
  top: calc(100% + 6px);
  z-index: 20;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  max-height: 280px;
  overflow: auto;
}

.suggestion-item {
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
}

.suggestion-item:hover,
.suggestion-item.active {
  background: var(--bg-hover);
}

.suggestion-title {
  font-weight: 500;
}

.suggestion-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.suggestion-empty {
  padding: 12px 14px;
  color: var(--text-muted);
  font-size: 13px;
}

.header-error {
  margin: 0;
}

.search-results {
  max-width: 100%;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  margin: 8px 0 12px;
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

/* 聚合查询结果页：头部 30vh + 表格区 70vh */
.search-page-compact {
  flex: 1;
  min-height: 0;
  gap: 0;
  padding-bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-page-compact .search-page-header {
  flex: 0 0 auto;
  max-height: 30vh;
  overflow-y: auto;
  overflow-x: hidden;
  gap: 6px;
  padding: 0 0 6px;
  border-bottom: 1px solid var(--border-subtle);
}

.search-page-compact .search-results {
  flex: 1 1 0;
  min-height: 0;
  max-height: 70vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.search-page-compact .search-results > .message {
  flex: 0 0 auto;
}

.search-page-compact .search-results > .filter-bar-wrap {
  flex: 0 0 auto;
}

.search-page-compact .search-results > .table-wrap,
.search-page-compact .search-results > .code-value-result-section,
.search-page-compact .search-results > .material-hit-section,
.search-page-compact .search-results > .form-template-result-panel,
.search-page-compact .search-results > .document-result-panel {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
}

.search-page-compact .header-top {
  gap: 8px;
  align-items: center;
}

.search-page-compact .module-title {
  font-size: 16px;
}

.search-page-compact .header-search {
  gap: 8px;
}

.search-page-compact .header-search-input {
  padding: 6px 10px;
  font-size: 13px;
}

.search-page-compact .header-search .btn-primary {
  padding: 6px 14px;
  font-size: 13px;
}

.search-page-compact :deep(.module-category-cards) {
  gap: 4px;
}

.search-page-compact :deep(.cards-row) {
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 6px;
}

.search-page-compact :deep(.category-card) {
  min-height: 52px;
  padding: 6px 4px 4px;
  border-radius: 8px;
  gap: 2px;
}

.search-page-compact :deep(.category-card.selected) {
  transform: none;
}

.search-page-compact :deep(.category-card:hover) {
  transform: none;
}

.search-page-compact :deep(.card-icon) {
  width: 22px;
  height: 22px;
  font-size: 11px;
  border-radius: 5px;
}

.search-page-compact :deep(.card-label) {
  font-size: 10px;
}

.search-page-compact :deep(.card-count) {
  font-size: 13px;
}

.search-page-compact :deep(.cards-clear) {
  font-size: 11px;
}

.search-page-compact :deep(.subtype-tabs-wrap) {
  margin: 0;
}
</style>
