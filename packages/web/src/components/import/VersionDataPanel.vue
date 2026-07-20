<template>
  <div class="data-panel">
    <p class="hint">
      将 JSON payload 解析为表格展示：表头为 Excel 列名，数据行与导入 sheet 一致。建议选择具体版本查看。
    </p>

    <fieldset class="form-section">
      <legend>筛选</legend>
      <div class="filter-bar">
        <label class="field compact">
          <span class="label">子类</span>
          <select v-model="filterSubtypeCode" @change="onSubtypeFilterChange">
            <option value="">全部子类</option>
            <option v-for="st in catalog.subtypes" :key="st.code" :value="st.code">
              {{ st.name }}（{{ st.versions?.length || 0 }} 版本）
            </option>
          </select>
        </label>
        <label class="field compact">
          <span class="label">版本</span>
          <select v-model="filterVersionId" @change="loadRecords(true)">
            <option value="">全部版本</option>
            <option v-for="v in versionOptions" :key="v.id" :value="String(v.id)">
              {{ v.versionLabel }} · {{ v.sheetName }}（{{ v.recordCount }} 行）
            </option>
          </select>
        </label>
        <label class="field compact">
          <span class="label">关键词</span>
          <input
            v-model="filterKeyword"
            type="text"
            placeholder="搜索单元格内容"
            @keydown.enter="loadRecords(true)"
          />
        </label>
        <button type="button" class="btn-secondary" :disabled="loading" @click="loadRecords(true)">
          查询
        </button>
        <button type="button" class="btn-secondary" :disabled="loading" @click="resetFilters">
          重置
        </button>
      </div>
      <p class="summary">
        共 <strong>{{ total }}</strong> 条
        <span v-if="total">，当前显示第 {{ offset + 1 }}–{{ Math.min(offset + items.length, total) }} 条</span>
        <span v-if="columns.length > 1">，{{ columns.length }} 列</span>
      </p>
    </fieldset>

    <p v-if="message" class="feedback" :class="messageType">{{ message }}</p>

    <fieldset class="form-section">
      <legend>数据内容</legend>
      <div v-if="loading" class="muted loading">加载中...</div>
      <p v-else-if="!filterSubtypeCode && !filterVersionId" class="empty-hint">
        请选择子类或版本以查看数据。
      </p>
      <p v-else-if="!items.length" class="empty-hint">无匹配数据。</p>
      <div v-else class="table-scroll-panel">
        <p v-if="columns.length > 8" class="scroll-hint">列较多，可在下方表格区域内横向滚动查看</p>
        <div class="table-wrap">
          <table
            class="excel-table"
            :class="{ 'many-cols': columns.length > 8 }"
            :style="{ '--col-count': columns.length }"
          >
            <thead>
              <tr>
                <th
                  v-for="(col, colIndex) in columns"
                  :key="col.field"
                  :title="colTitle(col)"
                  :class="{ 'col-sticky': colIndex === 0 }"
                >
                  <span class="th-main">{{ col.header }}</span>
                  <span v-if="!col.system && col.label !== col.header" class="th-sub">{{ col.label }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in items" :key="row.id">
                <td
                  v-for="(col, colIndex) in columns"
                  :key="col.field"
                  :class="{
                    'cell-num': col.field === '__rowNum',
                    'col-sticky': colIndex === 0,
                  }"
                  :title="cellText(row, colIndex)"
                >
                  <span class="cell-text">{{ cellText(row, colIndex) || '—' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="total > limit" class="pager">
        <button type="button" class="btn-secondary" :disabled="loading || offset <= 0" @click="prevPage">
          上一页
        </button>
        <span class="pager-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
        <button
          type="button"
          class="btn-secondary"
          :disabled="loading || offset + limit >= total"
          @click="nextPage"
        >
          下一页
        </button>
      </div>
    </fieldset>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { listVersionRecords } from '../../api';

const props = defineProps({
  catalog: { type: Object, required: true },
  active: { type: Boolean, default: false },
});

const filterSubtypeCode = ref('');
const filterVersionId = ref('');
const filterKeyword = ref('');
const items = ref([]);
const columns = ref([]);
const total = ref(0);
const limit = ref(50);
const offset = ref(0);
const loading = ref(false);
const message = ref('');
const messageType = ref('');

const versionOptions = computed(() => {
  if (!filterSubtypeCode.value) {
    return props.catalog.subtypes.flatMap((st) =>
      (st.versions || []).map((v) => ({
        ...v,
        subtypeName: st.name,
      }))
    );
  }
  const st = props.catalog.subtypes.find((s) => s.code === filterSubtypeCode.value);
  return st?.versions || [];
});

const currentPage = computed(() => Math.floor(offset.value / limit.value) + 1);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

function colTitle(col) {
  if (col.system) return col.header;
  return `${col.header}（${col.label} / ${col.field}）`;
}

function cellText(row, colIndex) {
  const val = row.cells?.[colIndex];
  if (val === null || val === undefined) return '';
  return String(val);
}

function onSubtypeFilterChange() {
  const allowed = new Set(versionOptions.value.map((v) => String(v.id)));
  if (filterVersionId.value && !allowed.has(filterVersionId.value)) {
    filterVersionId.value = '';
  }
  loadRecords(true);
}

function resetFilters() {
  filterSubtypeCode.value = '';
  filterVersionId.value = '';
  filterKeyword.value = '';
  items.value = [];
  columns.value = [];
  total.value = 0;
  offset.value = 0;
  message.value = '';
}

async function loadRecords(resetOffset = false) {
  if (!filterSubtypeCode.value && !filterVersionId.value) {
    items.value = [];
    columns.value = [];
    total.value = 0;
    message.value = '';
    return;
  }
  if (resetOffset) offset.value = 0;
  loading.value = true;
  message.value = '';
  try {
    const res = await listVersionRecords({
      subtypeCode: filterSubtypeCode.value || undefined,
      versionId: filterVersionId.value ? Number(filterVersionId.value) : undefined,
      keyword: filterKeyword.value.trim() || undefined,
      limit: limit.value,
      offset: offset.value,
    });
    items.value = res.items || [];
    columns.value = res.columns || [];
    total.value = res.total || 0;
  } catch (e) {
    messageType.value = 'error';
    message.value = e.message || '加载失败';
    items.value = [];
    columns.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function prevPage() {
  offset.value = Math.max(0, offset.value - limit.value);
  loadRecords(false);
}

function nextPage() {
  offset.value += limit.value;
  loadRecords(false);
}

watch(
  () => props.active,
  (on) => {
    if (on && (filterSubtypeCode.value || filterVersionId.value)) {
      loadRecords(false);
    }
  }
);

watch(
  () => props.catalog,
  () => {
    if (props.active && (filterSubtypeCode.value || filterVersionId.value)) {
      loadRecords(false);
    }
  },
  { deep: true }
);
</script>

<style scoped>
.data-panel {
  min-width: 0;
  max-width: 100%;
}

.hint {
  margin: 0 0 12px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
}

.form-section {
  margin-top: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  min-width: 0;
  max-width: 100%;
}

.form-section legend {
  padding: 0 6px;
  font-weight: 600;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: flex-end;
}

.field.compact {
  min-width: 200px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 13px;
  color: #374151;
}

.field select,
.field input {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}

.summary {
  margin: 10px 0 0;
  font-size: 13px;
  color: #6b7280;
}

.feedback {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
}

.feedback.error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.empty-hint,
.loading {
  margin: 0;
  padding: 24px 8px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}

.table-scroll-panel {
  margin-top: 4px;
  min-width: 0;
  max-width: 100%;
}

.scroll-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #6b7280;
}

.table-wrap {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: 520px;
  overflow-x: scroll;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 #f8fafc;
  -webkit-overflow-scrolling: touch;
}

.table-wrap::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.table-wrap::-webkit-scrollbar-track {
  background: #f8fafc;
  border-radius: 8px;
}

.table-wrap::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 8px;
  border: 2px solid #f8fafc;
}

.table-wrap::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.excel-table {
  width: max-content;
  min-width: calc(56px + max(0, var(--col-count, 1) - 1) * 140px);
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
  table-layout: auto;
}

.excel-table th,
.excel-table td {
  border-right: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  vertical-align: middle;
  width: 140px;
  min-width: 140px;
  max-width: 140px;
  padding: 0;
  box-sizing: border-box;
}

.excel-table th:first-child,
.excel-table td:first-child {
  width: 56px;
  min-width: 56px;
  max-width: 56px;
}

.excel-table thead th {
  border-top: 1px solid #e5e7eb;
}

.excel-table th:first-child,
.excel-table td:first-child {
  border-left: 1px solid #e5e7eb;
}

.excel-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f1f5f9;
  font-weight: 600;
  color: #0f172a;
  height: 44px;
  max-height: 44px;
}

.excel-table th.col-sticky {
  left: 0;
  z-index: 4;
  box-shadow: 2px 0 4px rgba(15, 23, 42, 0.06);
}

.th-main,
.th-sub {
  display: block;
  padding: 0 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.th-sub {
  margin-top: 1px;
  font-size: 10px;
  font-weight: 400;
  color: #64748b;
}

.excel-table tbody tr {
  height: 36px;
}

.excel-table tbody tr:nth-child(even) td {
  background: #f8fafc;
}

.excel-table tbody tr:nth-child(even) td.col-sticky {
  background: #f1f5f9;
}

.excel-table tbody tr:hover td {
  background: #eff6ff;
}

.excel-table tbody tr:hover td.col-sticky {
  background: #dbeafe;
}

.excel-table td.col-sticky {
  position: sticky;
  left: 0;
  z-index: 1;
  background: #fff;
  box-shadow: 2px 0 4px rgba(15, 23, 42, 0.04);
}

.cell-text {
  padding: 0 10px;
  height: 36px;
  line-height: 18px;
  overflow: hidden;
  word-break: break-all;
  color: #1e293b;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: normal;
}

.cell-num .cell-text {
  text-align: center;
  color: #64748b;
  -webkit-line-clamp: 1;
  line-height: 36px;
  word-break: normal;
}

.pager {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.pager-info {
  font-size: 13px;
  color: #6b7280;
}

.btn-secondary {
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 14px;
  background: #f3f4f6;
  color: #111827;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
