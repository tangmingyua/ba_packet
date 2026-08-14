<template>
  <section
    class="search-page"
    :class="{
      'search-page-landing': !searched,
      'search-page-compact': searched,
    }"
  >
    <SearchPageWatermark />
    <!-- 新头部：模块 Tab + 标签卡片 + 子类 + 查询/筛选 -->
    <header class="search-page-header">
      <div v-if="searched" class="search-page-header-scroll">
        <div
          class="module-tabs-row"
          :class="{ 'module-tabs-row--solo': !modules.length }"
        >
          <ModuleTabs
            v-if="modules.length"
            v-model="moduleCode"
            :options="modules"
            :hit-map="moduleHitMap"
            @change="onModuleChange"
          />
          <p v-else-if="moduleLabel" class="module-tab-fallback" :title="moduleCode">
            {{ moduleLabel }}
          </p>
          <button type="button" class="btn back-home-btn" @click="onGoHome">← 返回首页</button>
        </div>

        <ModuleCategoryCards
          v-if="isAggregateMode && moduleCode"
          v-model="selectedCategories"
          single
          :options="displayCategoryStats"
          @change="onCategoriesChange"
        />

        <SubtypeTabs
          v-if="showSubtypeTabs"
          v-model="selectedSubtypeCode"
          :options="displaySubtypeStats"
          @change="onSubtypeChange"
        />
      </div>

      <template v-else>
        <div class="landing-hero home-center">
        <div class="home-logo">
          <div class="home-logo-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span class="home-logo-text">Pocket BA</span>
        </div>
        <SearchLandingModeCards
          v-model="landingQueryMode"
          @change="onLandingModeChange"
        />
        </div>
      </template>

      <div class="header-search-row" :class="{ 'header-toolbar-unified-size': searched }">
        <form
          class="header-search"
          :class="{ 'landing-search-shell': !searched }"
          @submit.prevent="doSearch"
        >
          <span v-if="!searched" class="landing-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
          </span>
          <select
            v-if="showHeaderModuleSelect"
            v-model="moduleCode"
            class="header-module-select"
            aria-label="主类"
            @change="onModuleChange"
          >
            <option v-for="m in modules" :key="m.code" :value="m.code">{{ m.name }}</option>
          </select>
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
              :key="`${item.moduleCode || ''}-${item.reportCode}-${item.tableName}-${item.dataItemName}-${index}`"
              class="suggestion-item"
              :class="{ active: index === suggestIndex }"
              @mousedown.prevent="pickSuggest(item)"
            >
              <div class="suggestion-title" v-html="suggestTitleHtml(item)" />
              <div class="suggestion-meta">
                <span v-if="item.moduleName || item.moduleCode" class="suggestion-module">
                  {{ item.moduleName || item.moduleCode }}
                </span>
                <template v-if="suggestShowSubtype(item)">
                  <span v-if="item.moduleName || item.moduleCode"> · </span>
                  <span class="suggestion-subtype">{{ item.reportName }}</span>
                </template>
                <span v-if="item.tableName">
                  <span v-if="(item.moduleName || item.moduleCode) || suggestShowSubtype(item)"> · </span>
                  表名：{{ item.tableName }}
                </span>
                <span v-if="item.categoryLabel" class="category-tag">{{ item.categoryLabel }}</span>
              </div>
            </div>
          </div>
        </form>

        <ResultFilterBar
          v-if="searched && showHeaderFilterBar"
          class="header-filter-bar"
          :variant="filterBarVariant"
          :mode="searchMode"
          :hide-keyword="searched"
          :compact="searched"
          v-model:keyword="keyword"
          v-model:table-filter="tableFilter"
          v-model:custom-filters="customFilters"
          v-model:category-filter="selectedCategories"
          :category-options="[]"
          :table-options="tableOptions"
          :column-options="columnOptions"
          :rows="filterBarRows"
          :suggestions="filterSuggestions"
          :suggest-index="filterSuggestIndex"
          :show-suggest="filterShowSuggest"
          :loading="loading"
          @search="onFilterSearch"
          @reset="resetFilterBarOnly"
          @suggest-pick="pickFilterSuggest"
          @suggest-nav="moveFilterSuggest"
          @suggest-show="onFilterSuggestInput"
          @suggest-hide="filterShowSuggest = false"
        />
      </div>
    </header>

    <!-- 结果区 -->
    <section v-if="searched" class="search-results">
      <p v-if="error" class="message error">{{ error }}</p>

      <!-- 聚合查询：按所选子类 storageKind 切换渲染 -->
      <template v-if="useSubtypeScopedRender">
        <AggregateBrowsePanel
          v-if="showAggregateBrowse && aggregateBrowseData"
          :columns="aggregateBrowseData.columns"
          :items="displayAggregateBrowseItems"
          :link-column-label="aggregateLinkColumnLabel"
          :empty-text="emptyText"
          @pick="onAggregateBrowsePick"
        />
        <DynamicResultTable
          v-else-if="selectedStorageKind === 'excel'"
          :rows="filteredRows"
          :column-meta="columnMeta"
          :keyword="lastKeyword"
          :title="subtypeResultTitle"
          :empty-text="emptyText"
          :show-back="detailFromAggregateBrowse"
          @back="onBackFromAggregateDetail"
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
          :subtype-code="selectedSubtypeCode"
          :empty-text="emptyText"
        />

        <DocumentResultPanel
          v-else-if="selectedStorageKind === 'document'"
          :keyword="lastKeyword"
          :module-code="moduleCode"
          :subtype-code="selectedSubtypeCode"
          :empty-text="emptyText"
        />

        <WordFaithfulResultPanel
          v-else-if="selectedStorageKind === 'word_faithful'"
          :keyword="lastKeyword"
          :module-code="moduleCode"
          :subtype-code="selectedSubtypeCode"
          :default-version-label="resolveDefaultVersionLabelForSubtype(selectedSubtypeCode)"
          :empty-text="emptyText"
        />

        <ConversionScriptListPanel
          v-else-if="selectedStorageKind === 'script'"
          embedded
          :module-code="moduleCode"
          :keyword="lastKeyword"
          :fetch-key="scriptListFetchKey"
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
  fetchModuleHitMap,
  fetchTabHitStats,
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
import WordFaithfulResultPanel from '../components/search/WordFaithfulResultPanel.vue';
import ConversionScriptListPanel from '../components/conversion-script/ConversionScriptListPanel.vue';
import UnifiedMaterialHitList from '../components/search/UnifiedMaterialHitList.vue';
import AggregateBrowsePanel from '../components/search/AggregateBrowsePanel.vue';
import SearchPageWatermark from '../components/search/SearchPageWatermark.vue';
import ModuleCategoryCards from '../components/search/ModuleCategoryCards.vue';
import SearchLandingModeCards from '../components/search/SearchLandingModeCards.vue';
import ModuleTabs from '../components/search/ModuleTabs.vue';
import SubtypeTabs from '../components/search/SubtypeTabs.vue';
import { parseCategoryFilter, QUERY_DISPLAY_CATEGORIES, getCategoryLabel } from '../constants/materialCategories.js';
import {
  buildColumnMeta,
  createMultiSelectFilterRule,
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
import { buildAggregateBrowseItemsFromRows } from '../utils/aggregateBrowseClient.js';

const emit = defineEmits(['search-state']);

const route = useRoute();
const router = useRouter();
const homeResetSignal = inject('homeResetSignal', ref(0));
const pendingHomeMode = inject('pendingHomeMode', ref(null));
const goHome = inject('goHome', () => {});

const homeMode = ref('aggregate');
const landingQueryMode = ref('aggregate');
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
const aggregateBrowseData = ref(null);
const showAggregateBrowse = ref(false);
const detailFromAggregateBrowse = ref(false);
const activeReportCode = ref('');
const elapsedMs = ref(0);
const scriptListFetchKey = ref(0);
const moduleHitMap = ref({});
const tabHitStats = ref({ categories: {}, subtypes: {} });
const fieldMappingsByVersion = ref({});
const fieldMappingDefaultFilterByVersion = ref({});
const catalogSubtypes = ref([]);

const tableFilter = ref('__all__');
const customFilters = ref([]);
const appliedTableFilter = ref('__all__');
const appliedCustomFilters = ref([]);

const filterSuggestions = ref([]);
const filterSuggestIndex = ref(-1);
const filterShowSuggest = ref(false);
let suggestTimer = null;
let filterSuggestTimer = null;
let moduleHitAbort = null;
let tabHitAbort = null;

const VALID_SEARCH_MODES = ['norm', 'qa', 'aggregate'];
const MODE_TO_CATEGORIES = {
  norm: ['norm'],
  qa: ['qa'],
  aggregate: [],
};

const modeLabels = { norm: '查规范', qa: '查答疑', aggregate: '按模块查询' };

/** 首页「查规范」联想范围：一表通、EAST、金数 */
const NORM_LANDING_SUGGEST_MODULE_CODES = ['YBT', 'EAST', 'FIN_BASIC_DATA'];

const modeConfig = {
  norm: { placeholder: '搜索数据项名称，如：贷款、客户、机构...' },
  qa: { placeholder: '搜索答疑问题或关键词...' },
  aggregate: { placeholder: '按模块搜索规范、答疑、表样、说明、脚本...' },
};

/** 详情页不展示的资料类型标签（仍可通过子类等检索） */
const DETAIL_HIDDEN_CATEGORY_CODES = new Set(['code_value']);

const visibleCategoryStats = computed(() => {
  const byCode = new Map((categoryStats.value || []).map((c) => [c.code, c]));
  return QUERY_DISPLAY_CATEGORIES.map((code) => {
    const row = byCode.get(code);
    return {
      code,
      label: row?.label || getCategoryLabel(code),
      count: row?.count ?? 0,
      hasSubtype: row?.hasSubtype ?? false,
    };
  });
});

const displayCategoryStats = computed(() => {
  const base = visibleCategoryStats.value;
  if (!searched.value) return base;
  const hits = tabHitStats.value.categories || {};
  return base.map((cat) => ({
    ...cat,
    count: hits[cat.code] ?? 0,
  }));
});

const displaySubtypeStats = computed(() => {
  if (!searched.value) return subtypeStats.value;
  const hits = tabHitStats.value.subtypes || {};
  return subtypeStats.value.map((st) => ({
    ...st,
    count: hits[st.code] ?? 0,
  }));
});

const searchMode = computed(() => {
  if (searched.value) {
    const mode = route.query.mode;
    if (mode === 'norm' || mode === 'qa' || mode === 'aggregate') return mode;
    return homeMode.value;
  }
  return homeMode.value;
});

const isQaLayout = computed(() => searchMode.value === 'qa' || searchMode.value === 'aggregate');

const searchPlaceholder = computed(() => {
  const mode = searched.value ? searchMode.value : landingQueryMode.value;
  return modeConfig[mode]?.placeholder || modeConfig.aggregate.placeholder;
});

function apiSearchMode() {
  const mode = searchMode.value;
  return VALID_SEARCH_MODES.includes(mode) ? mode : 'aggregate';
}

const isAggregateMode = computed(() => apiSearchMode() === 'aggregate');

const showHeaderModuleSelect = computed(() => {
  if (searched.value) return false;
  if (!modules.value.length) return false;
  return landingQueryMode.value === 'aggregate';
});

const filterBarVariant = computed(() => (apiSearchMode() === 'qa' ? 'qa' : 'norm'));

const showSubtypeTabs = computed(
  () => searched.value && subtypeStats.value.length > 0
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
  () =>
    searched.value && Boolean(selectedSubtypeCode.value && selectedStorageKind.value)
);

const MATERIAL_STORAGE_KINDS = new Set([]);

const isMaterialStorageKind = computed(() =>
  MATERIAL_STORAGE_KINDS.has(selectedStorageKind.value)
);

const SUBTYPE_RESULT_TITLES = {
  excel: '配置类数据',
  form_template: '表样命中',
  document: '说明命中',
  word_faithful: 'Word 原文',
  script: '脚本命中',
  code_value: '码值',
};

const subtypeResultTitle = computed(() => {
  const kind = selectedStorageKind.value;
  if (kind && SUBTYPE_RESULT_TITLES[kind]) return SUBTYPE_RESULT_TITLES[kind];
  return selectedSubtypeLabel.value || tableTitle.value;
});

/** 聚合目录中可点击进入详情的列（表名 / 报表） */
const aggregateLinkColumnLabel = computed(() => {
  const cols = aggregateBrowseData.value?.columns || [];
  const tableNameCol = cols.find((c) => c.code === 'table_name');
  if (tableNameCol?.label) return tableNameCol.label;
  const reportCol = cols.find((c) => c.label === '报表');
  if (reportCol?.label) return reportCol.label;
  return '';
});

const showResultFilterBar = computed(() => {
  if (showAggregateBrowse.value && selectedStorageKind.value === 'excel') return true;
  if (showAggregateBrowse.value) return false;
  if (useSubtypeScopedRender.value) {
    return selectedStorageKind.value === 'excel';
  }
  return true;
});

const showHeaderFilterBar = computed(() => searched.value && showResultFilterBar.value);

const ALL_SUBTYPE = '__all__';

watch(
  () => route.query.categories,
  (raw) => {
    const parsed = parseCategoryFilter(raw);
    selectedCategories.value = parsed.length ? [parsed[0]] : [];
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

function subtypePickRank(st) {
  if (st.category === 'norm' && st.storageKind === 'excel') return 0;
  if (st.category === 'norm') return 1;
  return 2;
}

function ensureSubtypeSelection() {
  if (!subtypeStats.value.length) {
    selectedSubtypeCode.value = '';
    return;
  }
  if (
    selectedSubtypeCode.value &&
    subtypeStats.value.some((s) => s.code === selectedSubtypeCode.value)
  ) {
    return;
  }
  const sorted = [...subtypeStats.value].sort((a, b) => {
    const d = subtypePickRank(a) - subtypePickRank(b);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  selectedSubtypeCode.value = sorted[0].code;
}

function resolveAggregateBrowseFromResult(result) {
  const browse = result?.aggregateBrowse;
  if (!browse?.columns?.length) return null;
  return browse;
}

function shouldEnterAggregateBrowse(result) {
  const mode = apiSearchMode();
  if (mode !== 'aggregate' && mode !== 'norm') return false;
  if (String(result?.keyword ?? '').trim()) return false;
  if (selectedStorageKind.value !== 'excel') return false;
  if (selectedSubtypeMeta.value?.category !== 'norm') return false;
  return Boolean(resolveAggregateBrowseFromResult(result));
}

function applyAggregateBrowseState(result) {
  aggregateBrowseData.value = resolveAggregateBrowseFromResult(result);
  if (shouldEnterAggregateBrowse(result)) {
    showAggregateBrowse.value = true;
  } else {
    showAggregateBrowse.value = false;
  }
}

function collectDefaultFilterColumnLabels(byVersion) {
  const cols = [];
  const seen = new Set();
  for (const vid of Object.keys(byVersion || {}).sort()) {
    for (const col of byVersion[vid] || []) {
      if (col && !seen.has(col)) {
        seen.add(col);
        cols.push(col);
      }
    }
  }
  return cols;
}

function resolveVersionExcelColumnLabel() {
  for (const vid of Object.keys(fieldMappingsByVersion.value).sort()) {
    const mapped = fieldMappingsByVersion.value[vid]?.version;
    if (mapped) return mapped;
  }
  return '版本';
}

function resolveDefaultVersionLabelForSubtype(subtypeCode) {
  const code = String(subtypeCode || '').trim();
  if (!code) return '';
  const st = catalogSubtypes.value.find((s) => s.code === code);
  const def = st?.versions?.find((v) => v.isDefault);
  return def?.versionLabel?.trim() || '';
}

function buildSubtypeDefaultCustomFilters(result) {
  const byVersion =
    result?.fieldMappingDefaultFilterByVersion || fieldMappingDefaultFilterByVersion.value;
  const cols = collectDefaultFilterColumnLabels(byVersion);
  if (!cols.length) return [];

  const versionCol = resolveVersionExcelColumnLabel();
  const defaultVersion = resolveDefaultVersionLabelForSubtype(selectedSubtypeCode.value);

  return cols.map((col) => {
    if (col === versionCol && defaultVersion) {
      return createMultiSelectFilterRule({ col, op: 'in', val: [defaultVersion] });
    }
    return createMultiSelectFilterRule({ col, op: 'in', val: [] });
  });
}

function applySubtypeDefaultFilters(result) {
  customFilters.value = buildSubtypeDefaultCustomFilters(result);
  appliedCustomFilters.value = normalizeActiveFilters(customFilters.value);
}

function customFiltersFromAggregateRow(row) {
  const linkLabel = aggregateLinkColumnLabel.value;
  const defaults = buildSubtypeDefaultCustomFilters(null);

  const fillMultiSelectFromRow = (rule) => {
    const rowVal = String(row.values?.[rule.col] ?? '').trim();
    if (rowVal) {
      return createMultiSelectFilterRule({ col: rule.col, op: 'in', val: [rowVal] });
    }
    return createMultiSelectFilterRule({
      col: rule.col,
      op: 'in',
      val: [...(rule.val || [])],
    });
  };

  const rules = defaults.map((rule) => fillMultiSelectFromRow(rule));

  if (linkLabel && !rules.some((r) => r.col === linkLabel)) {
    rules.push(fillMultiSelectFromRow(createMultiSelectFilterRule({ col: linkLabel, op: 'in', val: [] })));
  }

  return rules;
}

function onAggregateBrowsePick(row) {
  const linkLabel = aggregateLinkColumnLabel.value;
  if (!linkLabel) return;
  showAggregateBrowse.value = false;
  detailFromAggregateBrowse.value = true;
  customFilters.value = customFiltersFromAggregateRow(row);
  appliedCustomFilters.value = normalizeActiveFilters(customFilters.value);
}

function onBackFromAggregateDetail() {
  detailFromAggregateBrowse.value = false;
  applySubtypeDefaultFilters(null);
  showAggregateBrowse.value = true;
}

watch(
  [appliedCustomFilters, lastKeyword, aggregateBrowseData, selectedSubtypeCode, selectedStorageKind],
  () => {
    if (!searched.value || lastKeyword.value) {
      if (lastKeyword.value) showAggregateBrowse.value = false;
      return;
    }
    if (selectedStorageKind.value !== 'excel') return;
    if (selectedSubtypeMeta.value?.category !== 'norm') return;
    const mode = apiSearchMode();
    if (mode !== 'aggregate' && mode !== 'norm') return;
    if (!aggregateBrowseData.value?.columns?.length) return;
    if (!normalizeActiveFilters(appliedCustomFilters.value).length) {
      showAggregateBrowse.value = true;
      detailFromAggregateBrowse.value = false;
    }
  }
);

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

const filterBarRows = computed(() => {
  const primary = baseRows.value;
  if (primary.length) return primary;
  return resultRowsForColumns.value;
});

const tableOptions = computed(() => getTableOptions(baseRows.value));
const columnOptions = computed(() => getColumnOptions(resultRowsForColumns.value));

const filteredRows = computed(() =>
  filterRows(baseRows.value, {
    tableFilter: isQaLayout.value ? '__all__' : appliedTableFilter.value,
    customFilters: appliedCustomFilters.value,
  })
);

const displayAggregateBrowseItems = computed(() => {
  const data = aggregateBrowseData.value;
  if (!data?.columns?.length) return [];
  const rows = filterRows(baseRows.value, {
    tableFilter: isQaLayout.value ? '__all__' : appliedTableFilter.value,
    customFilters: customFilters.value,
  });
  return buildAggregateBrowseItemsFromRows(rows, data.columns);
});

/** 答疑类 Excel 列表：版本列默认隐藏；EAST 答疑详情保留版本为首列 */
const hideVersionByDefault = computed(() => {
  const isEastQa =
    moduleCode.value === 'EAST' &&
    (searchMode.value === 'qa' ||
      selectedSubtypeMeta.value?.category === 'qa' ||
      activeReport.value?.category === 'qa' ||
      (selectedCategories.value.length === 1 && selectedCategories.value[0] === 'qa'));
  if (isEastQa) return false;

  if (searchMode.value === 'qa') return true;
  if (searchMode.value !== 'aggregate') return false;
  if (selectedSubtypeMeta.value?.category === 'qa') return true;
  if (activeReport.value?.category === 'qa') return true;
  const cats = selectedCategories.value;
  if (cats.length === 1 && cats[0] === 'qa') return true;
  return false;
});

const columnMeta = computed(() => {
  const rows = filteredRows.value.length ? filteredRows.value : baseRows.value;
  const mode =
    searchMode.value === 'norm'
      ? 'norm'
      : searchMode.value === 'aggregate'
        ? 'aggregate'
        : 'qa';
  return buildColumnMeta(rows, mode, {
    hideVersionByDefault: hideVersionByDefault.value,
  });
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
  if (isQaLayout.value) return searchMode.value === 'aggregate' ? '模块资料' : '答疑数据';
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

function syncModeFromCategorySelection() {
  /* 详情页查询方式由 URL mode 固定，不因标签多选自动切 aggregate */
}

function categoriesForSubtypeStats() {
  const mode = apiSearchMode();
  if (mode === 'aggregate') {
    return selectedCategories.value.length ? [...selectedCategories.value] : [];
  }
  if (mode === 'norm' || mode === 'qa') {
    return [...(MODE_TO_CATEGORIES[mode] || [])];
  }
  return selectedCategories.value.length ? [...selectedCategories.value] : [];
}

function searchApiOptions() {
  const mode = apiSearchMode();
  const opts = {
    moduleCode: moduleCode.value || undefined,
  };
  if (selectedSubtypeCode.value) {
    opts.subtypeCode = selectedSubtypeCode.value;
  }
  if (mode === 'aggregate' && selectedCategories.value.length) {
    opts.categories = selectedCategories.value;
  }
  return opts;
}

function applySidebarMode(mode) {
  if (!VALID_SEARCH_MODES.includes(mode)) return;
  homeMode.value = mode;
  selectedCategories.value = [...(MODE_TO_CATEGORIES[mode] || [])];
  if (isNormOrQaMode(mode)) {
    applyNormQaDefaultModule();
  }
  if (!searched.value) {
    landingQueryMode.value = mode;
  }
}

function resetLocalFilters() {
  tableFilter.value = '__all__';
  customFilters.value = [];
  appliedTableFilter.value = '__all__';
  appliedCustomFilters.value = [];
}

function applySearchFieldMappings(result) {
  fieldMappingsByVersion.value = result?.fieldMappingsByVersion || {};
  fieldMappingDefaultFilterByVersion.value = result?.fieldMappingDefaultFilterByVersion || {};
  mergeFieldMappingsByVersion(result?.fieldMappingsByVersion || {});
  mergeFieldMappingOrdersByVersion(result?.fieldMappingOrdersByVersion || {});
  mergeFieldMappingDefaultDisplayByVersion(result?.fieldMappingDefaultDisplayByVersion || {});
  mergeFieldLabels(result?.fieldLabels || {});
}

function applyDefaultFilterColumns(result) {
  applySubtypeDefaultFilters(result);
}

function resetAll() {
  keyword.value = '';
  lastKeyword.value = '';
  reports.value = [];
  aggregateBrowseData.value = null;
  showAggregateBrowse.value = false;
  detailFromAggregateBrowse.value = false;
  activeReportCode.value = '';
  error.value = '';
  searched.value = false;
  homeMode.value = 'aggregate';
  landingQueryMode.value = 'aggregate';
  resetLocalFilters();
  filterShowSuggest.value = false;
  showSuggest.value = false;
  selectedCategories.value = [];
  selectedSubtypeCode.value = '';
  subtypeStats.value = [];
  applySearchFieldMappings({});
}

function buildSearchQuery() {
  const mode = apiSearchMode();
  const query = {
    mode,
    moduleCode: moduleCode.value || undefined,
  };
  if (selectedCategories.value.length) {
    query.categories = selectedCategories.value[0];
  }
  if (selectedSubtypeCode.value) {
    query.subtypeCode = selectedSubtypeCode.value;
  }
  if (lastKeyword.value) query.q = lastKeyword.value;
  return query;
}

function resolveYbtModuleCode() {
  return (
    modules.value.find((m) => m.code === 'YBT')?.code ||
    modules.value[0]?.code ||
    moduleCode.value ||
    ''
  );
}

function isNormOrQaMode(mode) {
  return mode === 'norm' || mode === 'qa';
}

async function refreshModuleHitMap(keyword) {
  const mode = apiSearchMode();
  const q = String(keyword ?? '').trim();
  if (!isNormOrQaMode(mode) || !q) {
    moduleHitMap.value = {};
    return;
  }
  if (moduleHitAbort) moduleHitAbort.abort();
  moduleHitAbort = new AbortController();
  const { signal } = moduleHitAbort;
  try {
    const result = await fetchModuleHitMap(q, mode, { signal });
    if (signal.aborted) return;
    const map = {};
    for (const item of result.items || []) {
      if (item.hasHits) map[item.moduleCode] = true;
    }
    moduleHitMap.value = map;
  } catch (e) {
    if (e.name === 'AbortError') return;
    moduleHitMap.value = {};
  }
}

async function refreshTabHitStats(keyword) {
  if (!searched.value || !moduleCode.value) {
    tabHitStats.value = { categories: {}, subtypes: {} };
    return;
  }
  if (tabHitAbort) tabHitAbort.abort();
  tabHitAbort = new AbortController();
  const { signal } = tabHitAbort;
  const q = String(keyword ?? '');
  const mode = apiSearchMode();
  const cats = categoriesForSubtypeStats();
  try {
    const result = await fetchTabHitStats(q, mode, {
      moduleCode: moduleCode.value,
      categories: cats.length ? cats : undefined,
      signal,
    });
    if (signal.aborted) return;
    const categories = {};
    for (const item of result.categories || []) {
      categories[item.code] = Number(item.hitCount) || 0;
    }
    const subtypes = {};
    for (const item of result.subtypes || []) {
      subtypes[item.code] = Number(item.hitCount) || 0;
    }
    tabHitStats.value = { categories, subtypes };
  } catch (e) {
    if (e.name === 'AbortError') return;
    tabHitStats.value = { categories: {}, subtypes: {} };
  }
}

/** 查规范 / 查答疑详情默认一表通主类 */
function applyNormQaDefaultModule() {
  const ybt = resolveYbtModuleCode();
  if (ybt) moduleCode.value = ybt;
}

function previewSearchMode() {
  if (searched.value) return apiSearchMode();
  const mode = landingQueryMode.value;
  return VALID_SEARCH_MODES.includes(mode) ? mode : 'aggregate';
}

function previewSearchApiOptions() {
  const mode = previewSearchMode();
  const opts = {};
  if (mode === 'norm') {
    opts.moduleCodes = NORM_LANDING_SUGGEST_MODULE_CODES;
  } else if (mode === 'aggregate') {
    opts.moduleCode = moduleCode.value || resolveYbtModuleCode() || undefined;
    if (selectedCategories.value.length) {
      opts.categories = [...selectedCategories.value];
    }
  } else {
    opts.moduleCode = resolveYbtModuleCode() || undefined;
  }
  if (mode !== 'aggregate') {
    const cats = MODE_TO_CATEGORIES[mode] || [];
    if (cats.length) opts.categories = cats;
  }
  return opts;
}

async function applyLandingDefaultsBeforeSearch() {
  if (searched.value) return;

  const mode = VALID_SEARCH_MODES.includes(landingQueryMode.value)
    ? landingQueryMode.value
    : 'aggregate';
  homeMode.value = mode;
  landingQueryMode.value = mode;

  if (isNormOrQaMode(mode)) {
    applyNormQaDefaultModule();
  } else if (!moduleCode.value) {
    const ybt = resolveYbtModuleCode();
    if (ybt) moduleCode.value = ybt;
  }

  if (mode === 'aggregate') {
    await refreshCategoryStats();
    selectDefaultModuleCategory();
    await refreshSubtypeStats();
    ensureSubtypeSelection();
    return;
  }

  selectedCategories.value = [...(MODE_TO_CATEGORIES[mode] || [])];
  await refreshCategoryStats();
  await refreshSubtypeStats();
  ensureSubtypeSelection();
}

function onLandingModeChange() {
  if (searched.value) return;
  if (keyword.value.trim()) {
    onInput();
  }
}

function suggestShowSubtype(item) {
  if (!item?.reportName) return false;
  const mode = searched.value ? apiSearchMode() : landingQueryMode.value;
  return mode === 'qa';
}

function suggestTitleHtml(item) {
  const name = item.dataItemName || '';
  const q = keyword.value.trim();
  if (!q) return name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return highlightKeyword(name, q);
}

/** 结果页筛选栏 ↺：只清空表名/自定义筛选，不退出查询结果 */
function resetFilterBarOnly() {
  tableFilter.value = '__all__';
  appliedTableFilter.value = '__all__';
  applySubtypeDefaultFilters(null);
  filterShowSuggest.value = false;
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
  if (!moduleCode.value) {
    subtypeStats.value = [];
    selectedSubtypeCode.value = '';
    return;
  }
  try {
    const cats = categoriesForSubtypeStats();
    if (apiSearchMode() === 'aggregate' && !cats.length) {
      subtypeStats.value = [];
      selectedSubtypeCode.value = '';
      return;
    }
    const { items } = await getModuleSubtypeStats(
      moduleCode.value,
      cats.length ? cats : undefined
    );
    subtypeStats.value = items || [];
    ensureSubtypeSelection();
  } catch {
    subtypeStats.value = [];
    selectedSubtypeCode.value = '';
  }
}

async function ensureCatalogSubtypes() {
  if (catalogSubtypes.value.length) return;
  try {
    const catalog = await getDatasetCatalog();
    catalogSubtypes.value = catalog.subtypes || [];
  } catch {
    catalogSubtypes.value = [];
  }
}

async function loadModules() {
  try {
    const catalog = await getDatasetCatalog();
    modules.value = catalog.modules || [];
    catalogSubtypes.value = catalog.subtypes || [];
    if (!moduleCode.value && modules.value.length) {
      moduleCode.value =
        route.query.moduleCode ||
        modules.value.find((m) => m.code === 'YBT')?.code ||
        modules.value[0].code;
    }
  } catch {
    modules.value = [];
  }
}

async function ensureModulesLoaded() {
  if (modules.value.length) return;
  await loadModules();
}

async function refreshCategoryStats() {
  if (!moduleCode.value) return;
  try {
    const { items } = await getModuleCategoryStats(moduleCode.value);
    categoryStats.value = items || [];
    const allowed = new Set(
      visibleCategoryStats.value.filter((c) => c.hasSubtype).map((c) => c.code)
    );
    if (selectedCategories.value.length) {
      selectedCategories.value = selectedCategories.value.filter((c) => allowed.has(c));
    }
  } catch {
    categoryStats.value = [];
  }
}

function selectDefaultModuleCategory() {
  const selectable = visibleCategoryStats.value.filter((c) => c.hasSubtype);
  const norm = selectable.find((c) => c.code === 'norm');
  if (norm) {
    selectedCategories.value = ['norm'];
    return;
  }
  selectedCategories.value = selectable[0] ? [selectable[0].code] : [];
}

function clearQueryConditions() {
  keyword.value = '';
  lastKeyword.value = '';
  resetLocalFilters();
  appliedTableFilter.value = '__all__';
  appliedCustomFilters.value = [];
  showSuggest.value = false;
  filterShowSuggest.value = false;
  suggestions.value = [];
  selectedSubtypeCode.value = '';
  reports.value = [];
  aggregateBrowseData.value = null;
  showAggregateBrowse.value = false;
  detailFromAggregateBrowse.value = false;
  activeReportCode.value = '';
  applySearchFieldMappings({});
}

function clearQueryOnModuleChange() {
  const mode = apiSearchMode();
  if (!searched.value || mode === 'aggregate') {
    clearQueryConditions();
    return;
  }
  activeReportCode.value = '';
  aggregateBrowseData.value = null;
  showAggregateBrowse.value = false;
  detailFromAggregateBrowse.value = false;
  showSuggest.value = false;
  filterShowSuggest.value = false;
  suggestions.value = [];
}

function onModuleChange() {
  clearQueryOnModuleChange();
  refreshCategoryStats()
    .then(() => {
      if (searched.value && apiSearchMode() === 'aggregate') {
        selectDefaultModuleCategory();
      }
      return refreshSubtypeStats();
    })
    .then(() => {
      if (searched.value) {
        void router.replace({ path: '/', query: buildSearchQuery() });
        doSearch();
      }
    });
}

function onGoHome() {
  goHome();
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

function shouldUseHeaderSuggest() {
  if (searched.value && selectedSubtypeCode.value && selectedStorageKind.value !== 'excel') {
    return false;
  }
  return true;
}

async function loadSuggest() {
  const q = keyword.value.trim();
  if (!q) {
    suggestions.value = [];
    showSuggest.value = false;
    return;
  }
  if (!shouldUseHeaderSuggest()) {
    suggestions.value = [];
    showSuggest.value = false;
    return;
  }
  try {
    const mode = previewSearchMode();
    const opts = searched.value ? searchApiOptions() : previewSearchApiOptions();
    const { items } = await suggestItems(q, 10, mode, opts);
    suggestions.value = items || [];
    suggestIndex.value = -1;
    showSuggest.value = suggestions.value.length > 0;
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
    const mode = previewSearchMode();
    const opts = searched.value ? searchApiOptions() : previewSearchApiOptions();
    const { items } = await suggestItems(q, 10, mode, opts);
    filterSuggestions.value = items || [];
    filterSuggestIndex.value = -1;
    filterShowSuggest.value = filterSuggestions.value.length > 0;
  } catch {
    filterSuggestions.value = [];
    filterShowSuggest.value = false;
  }
}

function moveSuggest(step) {
  if (!suggestions.value.length) return;
  if (suggestIndex.value < 0) {
    if (step > 0) suggestIndex.value = 0;
    return;
  }
  const next = suggestIndex.value + step;
  if (next < 0) suggestIndex.value = suggestions.value.length - 1;
  else if (next >= suggestions.value.length) suggestIndex.value = 0;
  else suggestIndex.value = next;
}

function moveFilterSuggest(step) {
  if (!filterSuggestions.value.length) return;
  if (filterSuggestIndex.value < 0) {
    if (step > 0) filterSuggestIndex.value = 0;
    return;
  }
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
  // 仅在使用 ↑↓ 明确选中联想项时采纳；否则回车搜索输入框原文
  if (showSuggest.value && suggestIndex.value >= 0 && suggestions.value[suggestIndex.value]) {
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
  await ensureModulesLoaded();

  if (!searched.value) {
    await applyLandingDefaultsBeforeSearch();
  }

  if (subtypeStats.value.length) {
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
    const result = await searchRegulatory(q, apiSearchMode(), searchApiOptions());
    elapsedMs.value = Math.round(performance.now() - start);
    if (result.error) {
      error.value = result.error;
      reports.value = [];
      searched.value = false;
      moduleHitMap.value = {};
      tabHitStats.value = { categories: {}, subtypes: {} };
      applySearchFieldMappings({});
      return;
    }
    lastKeyword.value = result.keyword;
    applySearchFieldMappings(result);
    await ensureCatalogSubtypes();
    if (shouldEnterAggregateBrowse(result)) {
      detailFromAggregateBrowse.value = false;
      applySubtypeDefaultFilters(result);
      applyAggregateBrowseState(result);
    } else {
      applyDefaultFilterColumns(result);
      applyAggregateBrowseState(result);
      if (String(result?.keyword ?? '').trim()) {
        detailFromAggregateBrowse.value = false;
      }
    }
    reports.value = result.reports;
    pickDefaultTabs();
    appliedTableFilter.value = tableFilter.value;
    if (!shouldEnterAggregateBrowse(result)) {
      appliedCustomFilters.value = normalizeActiveFilters(customFilters.value);
    }
    searched.value = true;
    scriptListFetchKey.value += 1;
    if (apiSearchMode() === 'aggregate' && moduleCode.value) {
      if (!visibleCategoryStats.value.length) {
        await refreshCategoryStats();
      }
      if (visibleCategoryStats.value.length && !selectedCategories.value.length) {
        selectDefaultModuleCategory();
      }
    }
    await router.replace({ path: '/', query: buildSearchQuery() });
    void refreshModuleHitMap(q);
    void refreshTabHitStats(q);
  } catch (e) {
    searched.value = false;
    error.value = e.message || '搜索失败';
    reports.value = [];
    moduleHitMap.value = {};
    tabHitStats.value = { categories: {}, subtypes: {} };
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
    if (isNormOrQaMode(apiSearchMode())) return;
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
  if (isNormOrQaMode(apiSearchMode())) {
    applyNormQaDefaultModule();
  }
  await refreshCategoryStats();
  if (apiSearchMode() === 'aggregate' && !selectedCategories.value.length) {
    selectDefaultModuleCategory();
  }
  await refreshSubtypeStats();
  if (route.query.q !== undefined) {
    keyword.value = String(route.query.q);
    doSearch();
  }
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  if (moduleHitAbort) moduleHitAbort.abort();
  if (tabHitAbort) tabHitAbort.abort();
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
  gap: 22px;
  padding: 8px 0 48px;
  border-bottom: none;
}

.search-page-landing .landing-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  width: 100%;
}

.search-page-landing .landing-hero .home-logo {
  margin-bottom: 0;
}

.search-page-landing .header-search-row {
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
}

.search-page-landing .landing-search-shell {
  position: relative;
  align-items: center;
  flex-wrap: nowrap;
  gap: 10px;
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  padding: 8px 8px 8px 22px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-input);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.search-page-landing .landing-search-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--text-muted);
  pointer-events: none;
}

.search-page-landing .landing-search-icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.search-page-landing .landing-search-shell .header-module-select {
  flex: 0 0 auto;
  min-width: 64px;
  max-width: 92px;
  margin: 0;
  padding: 8px 18px 8px 2px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-right: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  color: var(--text);
  box-shadow: none;
  cursor: pointer;
}

.search-page-landing .landing-search-shell .header-search-input {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 12px 4px;
  font-size: 16px;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.search-page-landing .landing-search-shell .header-search-input:focus {
  outline: none;
  box-shadow: none;
}

.search-page-landing .landing-search-shell .btn-primary {
  flex-shrink: 0;
  margin: 0;
  padding: 12px 28px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 999px;
  border: none;
  background: #1a1a1a;
}

.search-page-landing .landing-search-shell .btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.search-page-landing .landing-search-shell .header-suggestions {
  left: 20px;
  right: 8px;
  top: calc(100% + 10px);
  border-radius: var(--radius-lg);
}

.search-page-landing :deep(.landing-mode-tabs) {
  width: auto;
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

.search-page-compact .header-module-select {
  flex: 0 0 auto;
  min-width: 96px;
  max-width: 160px;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
}

.search-page-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 0 6px;
  border-bottom: 1px solid var(--border-subtle);
}

.search-page-header :deep(.module-tabs) {
  margin: 0 -12px;
}

.module-tabs-row {
  display: flex;
  align-items: stretch;
  gap: 0;
  margin: 0 -12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
}

.module-tabs-row--solo {
  justify-content: flex-end;
}

.module-tabs-row :deep(.module-tabs) {
  flex: 1;
  min-width: 0;
  margin: 0;
  border-bottom: none;
}

.module-tab-fallback {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  align-self: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.back-home-btn {
  flex-shrink: 0;
  align-self: center;
  margin: 0 8px 0 4px;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  background: var(--bg);
  border: 1px solid var(--border);
}

.search-page-compact .module-tabs-row {
  margin: 0 -12px;
}

.search-page-compact .module-tabs-row :deep(.module-tabs) {
  margin: 0;
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
  border-right: none;
  border-radius: 0;
  min-height: 24px;
}

.search-page-compact .back-home-btn {
  padding: 3px 8px;
  font-size: 11px;
  margin-right: 4px;
}

.search-page-compact .header-search {
  flex: 1 1 220px;
  min-width: 160px;
  gap: 6px;
}

.header-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.header-search-input {
  flex: 1 1 220px;
  min-width: 160px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 14px;
}

.search-page-header :deep(.module-category-cards) {
  margin-top: 2px;
}

.search-page-header :deep(.subtype-tabs-wrap) {
  margin-top: 2px;
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

.suggestion-module {
  color: var(--text-secondary);
  font-weight: 600;
}

.suggestion-subtype {
  color: var(--text-secondary);
  font-weight: 500;
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

/* 聚合查询结果页：头部自适应高度，结果区占满剩余空间 */
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
  flex: 0 1 auto;
  max-height: 42vh;
  min-height: 0;
  overflow: visible;
  gap: 3px;
  padding: 0 0 6px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 5;
  background: var(--bg);
}

.search-page-compact .search-page-header-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.search-page-compact .search-page-header-scroll::-webkit-scrollbar {
  width: 6px;
}

.search-page-compact .search-page-header-scroll::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.search-page-compact .search-page-header :deep(.module-category-cards) {
  margin-top: 0;
}

.search-page-compact .search-results {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
  z-index: 1;
}

.search-page-compact .search-results > .message {
  flex: 0 0 auto;
  margin: 0;
}

.search-page-compact .search-results > .table-wrap,
.search-page-compact .search-results > .code-value-result-section,
.search-page-compact .search-results > .material-hit-section,
.search-page-compact .search-results > .form-template-result-panel,
.search-page-compact .search-results > .document-result-panel,
.search-page-compact .search-results > .cs-panel {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
}

.search-page-compact .header-search-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
  position: relative;
  z-index: 20;
  flex-shrink: 0;
  overflow: visible;
}

.search-page-compact .header-filter-bar {
  flex: 2 1 320px;
  min-width: 180px;
  position: relative;
  z-index: 25;
  overflow: visible;
}

.search-page-compact .header-search-input {
  padding: 6px 10px;
}

.search-page-compact .header-search .btn-primary {
  padding: 6px 14px;
}

/* 与筛选字段名「版本」(12px) 同字号，仅改 font-size */
.search-page-compact .header-toolbar-unified-size {
  --header-toolbar-font-size: 12px;
}

.search-page-compact .header-toolbar-unified-size .header-search-input,
.search-page-compact .header-toolbar-unified-size .header-search-input::placeholder,
.search-page-compact .header-toolbar-unified-size .header-module-select,
.search-page-compact .header-toolbar-unified-size .header-search .btn {
  font-size: var(--header-toolbar-font-size) !important;
}

.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .multi-select-field-name),
.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .multi-select-trigger),
.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .multi-select-trigger .placeholder),
.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .multi-select-trigger .selected-text),
.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .filter-group select),
.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .filter-group input),
.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .filter-input-compact),
.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .btn-add-filter),
.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .btn-icon),
.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .filter-actions .btn),
.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .custom-filter-index) {
  font-size: var(--header-toolbar-font-size) !important;
}

.search-page-compact .header-toolbar-unified-size :deep(.header-filter-bar .multi-select-trigger .dropdown-arrow) {
  font-size: 10px;
}

.search-page-compact :deep(.module-category-cards) {
  gap: 4px;
}

.search-page-compact :deep(.cards-row) {
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 4px;
}

.search-page-compact :deep(.category-card) {
  min-height: 42px;
  padding: 4px 3px 3px;
  border-radius: 8px;
  gap: 2px;
}

.search-page-compact :deep(.category-card.selected) {
  box-shadow:
    0 0 0 2px rgba(15, 23, 42, 0.35),
    0 2px 8px rgba(15, 23, 42, 0.12);
}

.search-page-compact :deep(.category-card:not(.selected)) {
  opacity: 1;
}

.search-page-compact :deep(.category-card:hover) {
  transform: none;
}

.search-page-compact :deep(.card-icon) {
  width: 16px;
  height: 16px;
  font-size: 9px;
  border-radius: 4px;
}

.search-page-compact :deep(.card-label) {
  font-size: 10px;
}

.search-page-compact :deep(.card-count) {
  font-size: 11px;
}

.search-page-compact :deep(.cards-actions) {
  font-size: 10px;
}

.search-page-compact :deep(.subtype-tabs-wrap) {
  margin: 0;
}

.search-page-compact :deep(.module-tabs-scroll) {
  width: 18px;
}

.search-page-compact :deep(.module-tab) {
  padding: 3px 8px 4px;
  font-size: 11px;
}
</style>
