<template>
  <div class="table-wrap result-table-wrap">
    <div class="table-header">
      <span class="table-title">
        {{ title }} <span class="table-count">{{ totalCount }}</span> 条
      </span>
      <div class="col-toggle-wrap">
        <button v-if="showBack" type="button" class="btn" @click="emit('back')">返回</button>
        <div ref="colPickerAnchorRef" class="result-col-picker">
          <button
            type="button"
            class="col-toggle-btn"
            :class="{ expanded: colPickerOpen }"
            :disabled="!visibleColumns.length"
            @click.stop="toggleColPicker"
          >
            展示列
            <span v-if="visibleColumns.length" class="col-picker-summary">
              {{ shownColumnsCount }}/{{ visibleColumns.length }}
            </span>
            <span class="col-picker-arrow">▾</span>
          </button>
        </div>
      </div>
    </div>

    <div ref="scrollRef" class="table-scroll result-table-scroll">
      <div v-if="!totalCount" class="empty">
        <div class="empty-icon">
          <svg
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <div>{{ emptyText }}</div>
      </div>

      <table v-else ref="tableRef" class="data-table dt-enhanced">
        <thead>
          <tr>
            <th
              v-for="col in tableColumns"
              :key="col"
              draggable="true"
              class="col-header-draggable"
              :class="{ 'col-dragging': dragCol === col, 'col-drag-over': dragOverCol === col }"
              :style="colWidthStyle(col)"
              @dragstart="onColDragStart(col, $event)"
              @dragend="onColDragEnd"
              @dragover="onColDragOver(col, $event)"
              @dragleave="onColDragLeave(col)"
              @drop="onColDrop(col, $event)"
            >
              <span
                class="col-header-label"
                draggable="false"
                role="button"
                tabindex="0"
                title="点击列操作"
                @click.stop="openColHeaderMenu(col, $event)"
                @keydown.enter.prevent="openColHeaderMenu(col, $event)"
              >
                {{ col }}
              </span>
              <div
                class="resize-handle"
                draggable="false"
                @mousedown.prevent="startResize(col, $event)"
                @dragstart.stop.prevent
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIdx) in pageRows" :key="rowIdx">
            <td
              v-for="col in tableColumns"
              :key="col"
              :class="cellClass(row, col)"
            >
              <template v-if="isLinkCell(row, col)">
                <div
                  class="cell-inner cell-link"
                  role="button"
                  tabindex="0"
                  title="点击查看码值表"
                  @click.stop="openCodeValueLookup(row, col)"
                  @keydown.enter.prevent="openCodeValueLookup(row, col)"
                >
                  <span
                    class="cell-link-text"
                    :class="{ 'cell-desc': isDesc(col), 'cell-keyword': isKeywordHighlight(col) }"
                    v-html="isKeywordHighlight(col) ? renderCellHtml(row, col) || '—' : escapeCellHtml(cellText(row, col)) || '—'"
                  />
                  <span class="link-icon" aria-hidden="true">🔗</span>
                </div>
              </template>

              <template v-else-if="isTruncatable(col)">
                <TruncatableCell
                  :ref="(el) => setCellRef(cellId(rowIdx, col), el)"
                  :text="cellText(row, col)"
                  :html="isKeywordHighlight(col) ? renderCellHtml(row, col) : ''"
                  :is-desc="isDesc(col)"
                  :active="expandedCell === cellId(rowIdx, col)"
                  @expand="openPopover($event, rowIdx, col, row)"
                  @copy="copyCell(row, col)"
                />
              </template>

              <template v-else-if="isKeywordHighlight(col)">
                <div class="cell-inner" :title="cellText(row, col)">
                  <span class="cell-keyword" v-html="renderCellHtml(row, col) || '—'" />
                </div>
              </template>

              <template v-else-if="isCode(col)">
                <div class="cell-inner">
                  <span class="cell-code">{{ cellText(row, col) || '—' }}</span>
                </div>
              </template>

              <template v-else-if="isGroup(col)">
                <div class="cell-inner">
                  <span class="cell-group">{{ cellText(row, col) || '—' }}</span>
                </div>
              </template>

              <template v-else>
                <div class="cell-inner" :title="cellText(row, col)">
                  <span :class="isDesc(col) ? 'cell-desc' : 'cell-secondary'">
                    {{ cellText(row, col) || '—' }}
                  </span>
                </div>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalCount" class="pagination">
      <label class="page-size-picker">
        <span class="page-size-label">每页</span>
        <select
          v-model.number="pageSizeLocal"
          class="page-size-select"
          aria-label="每页显示条数"
          @change="onPageSizeChange"
        >
          <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
        </select>
        <span class="page-size-label">条</span>
      </label>
      <template v-if="totalPages > 1">
        <button type="button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
          上一页
        </button>
        <template v-for="(item, idx) in pageList" :key="`${item.type}-${item.page ?? idx}`">
          <span v-if="item.type === 'ellipsis'" class="page-ellipsis">...</span>
          <span
            v-else
            class="page-num"
            :class="{ active: item.active }"
            @click="goToPage(item.page)"
          >
            {{ item.page }}
          </span>
        </template>
        <button
          type="button"
          :disabled="currentPage >= totalPages"
          @click="goToPage(currentPage + 1)"
        >
          下一页
        </button>
      </template>
    </div>

    <Teleport to="body">
      <div
        v-if="colPickerOpen"
        ref="colPickerDropdownRef"
        class="result-col-picker-dropdown"
        :style="colPickerStyle"
        @click.stop
      >
        <div class="result-col-picker-title">选择要展示的列</div>
        <div class="result-col-picker-list">
          <label
            v-for="col in visibleColumns"
            :key="col"
            class="result-col-picker-item"
          >
            <input
              type="checkbox"
              :checked="isColumnShown(col)"
              :disabled="isColumnShown(col) && shownColumnsCount <= 1"
              @change="onColumnPickerChange(col, $event)"
            />
            <span class="result-col-picker-label">{{ col }}</span>
          </label>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="colHeaderMenu"
        class="col-header-menu"
        :style="colHeaderMenuStyle"
        @click.stop
      >
        <button
          type="button"
          class="col-header-menu-item"
          :disabled="shownColumnsCount <= 1"
          @click="hideColumnFromMenu"
        >
          隐藏
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="popover"
        ref="popoverRef"
        class="cell-popover"
        :style="popoverStyle"
        @click.stop
      >
        <div class="cell-popover-header">
          <span class="cell-popover-title">{{ popover.col }}</span>
          <button type="button" class="cell-popover-close" @click="closePopover">×</button>
        </div>
        <div
          class="cell-popover-body"
          :class="{ 'cell-desc': popover.isDesc }"
          v-html="popover.html"
        />
        <div v-if="popover.isDesc" class="cell-popover-actions">
          <button type="button" class="btn" @click="copyPopover">复制</button>
        </div>
      </div>
    </Teleport>

    <div class="copy-toast" :class="{ show: toastVisible }">已复制</div>

    <CodeValueLookupModal
      v-if="codeValueModal"
      :module-code="codeValueModal.moduleCode"
      :dict-name="codeValueModal.dictName"
      :source-text="codeValueModal.sourceText"
      :parse-error="codeValueModal.parseError"
      @close="closeCodeValueModal"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import TruncatableCell from './TruncatableCell.vue';
import CodeValueLookupModal from './CodeValueLookupModal.vue';
import {
  PAGE_SIZE,
  ROW_LINK_COLUMNS_KEY,
  ROW_MODULE_CODE_KEY,
  buildPageList,
  copyText,
  highlightKeyword,
  paginateRows,
} from '../../composables/useDynamicTable.js';
import { extractDictNameFromCellText } from '../../utils/codeValueDictName.js';

const pageSizeOptions = [15, 50, 100];

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columnMeta: { type: Object, required: true },
  keyword: { type: String, default: '' },
  title: { type: String, default: '查询结果' },
  emptyText: { type: String, default: '未找到匹配结果' },
  pageSize: { type: Number, default: PAGE_SIZE },
  showBack: { type: Boolean, default: false },
});

const emit = defineEmits(['page-change', 'back']);

const currentPage = ref(1);
const pageSizeLocal = ref(
  pageSizeOptions.includes(props.pageSize) ? props.pageSize : PAGE_SIZE
);
const shownColumns = ref([]);
const colPickerOpen = ref(false);
const colPickerAnchorRef = ref(null);
const colPickerDropdownRef = ref(null);
const colPickerStyle = ref({});
const colHeaderMenu = ref(null);
const colHeaderMenuStyle = ref({});
const expandedCell = ref('');
const popover = ref(null);
const popoverStyle = ref({});
const toastVisible = ref(false);
const colWidths = ref({});
const scrollRef = ref(null);
const popoverRef = ref(null);
const cellRefs = new Map();
const codeValueModal = ref(null);
let resizing = null;
const columnOrder = ref([]);
const dragCol = ref(null);
const dragOverCol = ref(null);

const displayCols = computed(() => props.columnMeta.displayCols || []);
const secondaryCols = computed(() => props.columnMeta.secondaryCols || []);
const truncatableLabels = computed(() => props.columnMeta.truncatableLabels || []);
const descLabels = computed(() => props.columnMeta.descLabels || []);
const codeLabels = computed(() => props.columnMeta.codeLabels || []);
const groupLabels = computed(() => props.columnMeta.groupLabels || []);
const highlightLabels = computed(() => props.columnMeta.highlightLabels || []);

const paginated = computed(() =>
  paginateRows(props.rows, currentPage.value, pageSizeLocal.value)
);
const pageRows = computed(() => paginated.value.rows);
const totalCount = computed(() => paginated.value.total);
const totalPages = computed(() => paginated.value.totalPages);
const pageList = computed(() => buildPageList(currentPage.value, totalPages.value));

function syncColumnOrder(cols) {
  const next = cols || [];
  if (!next.length) {
    columnOrder.value = [];
    return;
  }
  if (!columnOrder.value.length) {
    columnOrder.value = [...next];
    return;
  }
  const kept = columnOrder.value.filter((c) => next.includes(c));
  const added = next.filter((c) => !kept.includes(c));
  columnOrder.value = [...kept, ...added];
}

const visibleColumns = computed(() =>
  columnOrder.value.length ? columnOrder.value : displayCols.value
);

const shownColumnSet = computed(() => new Set(shownColumns.value));

const shownColumnsCount = computed(() => shownColumns.value.length);

const tableColumns = computed(() =>
  visibleColumns.value.filter((col) => shownColumnSet.value.has(col))
);

function defaultShownColumnList() {
  const sec = new Set(secondaryCols.value);
  return displayCols.value.filter((col) => !sec.has(col));
}

function resetShownColumns() {
  const def = new Set(defaultShownColumnList());
  shownColumns.value = visibleColumns.value.filter((c) => def.has(c));
}

function isColumnShown(col) {
  return shownColumnSet.value.has(col);
}

function applyShownColumns(nextSet) {
  shownColumns.value = visibleColumns.value.filter((col) => nextSet.has(col));
  recheckAllOverflow();
}

function hideColumn(col) {
  if (shownColumnsCount.value <= 1) return;
  const next = new Set(shownColumns.value);
  next.delete(col);
  applyShownColumns(next);
}

function setColumnShown(col, shown) {
  const next = new Set(shownColumns.value);
  if (shown) next.add(col);
  else {
    if (next.size <= 1) return;
    next.delete(col);
  }
  applyShownColumns(next);
}

watch(
  () => props.columnMeta.displayCols,
  (cols) => {
    syncColumnOrder(cols || []);
    resetShownColumns();
  },
  { immediate: true }
);

watch(
  () => props.pageSize,
  (size) => {
    if (pageSizeOptions.includes(size)) pageSizeLocal.value = size;
  }
);

watch(
  () => props.rows,
  () => {
    currentPage.value = 1;
    closePopover();
    closeCodeValueModal();
    closeColHeaderMenu();
    cellRefs.clear();
  }
);

watch(shownColumns, () => recheckAllOverflow(), { deep: true });

watch(colWidths, () => recheckAllOverflow(), { deep: true });

function cellClass(row, col) {
  return {
    truncatable: isTruncatable(col) && !isLinkCell(row, col),
    'has-link': isLinkCell(row, col),
  };
}

function isLinkCell(row, col) {
  const links = row[ROW_LINK_COLUMNS_KEY];
  return Array.isArray(links) && links.includes(col);
}

function escapeCellHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function closeCodeValueModal() {
  codeValueModal.value = null;
}

function openCodeValueLookup(row, col) {
  closePopover();
  const sourceText = cellText(row, col);
  const moduleCode = row[ROW_MODULE_CODE_KEY] || '';
  const dictName = extractDictNameFromCellText(sourceText);

  if (!moduleCode) {
    codeValueModal.value = {
      moduleCode: '',
      dictName: '',
      sourceText,
      parseError: '无法确定所属模块，无法查询码值',
    };
    return;
  }

  if (!dictName) {
    codeValueModal.value = {
      moduleCode,
      dictName: '',
      sourceText,
      parseError: '无法从字段内容识别码表名称',
    };
    return;
  }

  codeValueModal.value = {
    moduleCode,
    dictName,
    sourceText,
    parseError: '',
  };
}

function isTruncatable(col) {
  return truncatableLabels.value.includes(col);
}

function isDesc(col) {
  return descLabels.value.includes(col);
}

function isKeywordHighlight(col) {
  return highlightLabels.value.includes(col);
}

function isCode(col) {
  return codeLabels.value.includes(col);
}

function isGroup(col) {
  return groupLabels.value.includes(col);
}

function cellText(row, col) {
  const val = row[col];
  if (val == null || val === '') return '';
  return String(val);
}

function setCellRef(id, el) {
  if (el) cellRefs.set(id, el);
  else cellRefs.delete(id);
}

function recheckAllOverflow() {
  nextTick(() => {
    cellRefs.forEach((cell) => cell.checkOverflow?.());
  });
}

function renderCellHtml(row, col) {
  const text = cellText(row, col);
  if (!text) return '';
  const kw = props.keyword.trim();
  if (isKeywordHighlight(col) && kw) {
    return highlightKeyword(text, kw);
  }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cellId(rowIdx, col) {
  return `cell_${rowIdx}_${col.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}`;
}

function closePopover() {
  expandedCell.value = '';
  popover.value = null;
  popoverStyle.value = {};
}

async function openPopover(event, rowIdx, col, row) {
  const id = cellId(rowIdx, col);
  if (expandedCell.value === id) {
    closePopover();
    return;
  }

  const anchor = event.currentTarget.getBoundingClientRect();
  expandedCell.value = id;
  popover.value = {
    id,
    col,
    row,
    rowIdx,
    html: renderCellHtml(row, col),
    text: cellText(row, col),
    isDesc: isDesc(col),
    anchor,
  };

  await nextTick();
  positionPopover();
}

function positionPopover() {
  if (!popover.value || !popoverRef.value) return;

  const anchor = popover.value.anchor;
  const el = popoverRef.value;
  const margin = 12;
  const gap = 6;
  const maxWidth = Math.min(480, window.innerWidth - margin * 2);
  const maxHeight = Math.min(320, window.innerHeight - margin * 2);

  el.style.maxWidth = `${maxWidth}px`;
  el.style.maxHeight = `${maxHeight}px`;

  const popRect = el.getBoundingClientRect();
  let top = anchor.bottom + gap;
  let left = anchor.left;

  if (left + popRect.width > window.innerWidth - margin) {
    left = window.innerWidth - popRect.width - margin;
  }
  if (left < margin) left = margin;

  if (top + popRect.height > window.innerHeight - margin) {
    top = anchor.top - popRect.height - gap;
  }
  if (top < margin) {
    top = margin;
  }

  popoverStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    maxWidth: `${maxWidth}px`,
    maxHeight: `${maxHeight}px`,
  };
}

async function copyCell(row, col) {
  await copyText(cellText(row, col));
  toastVisible.value = true;
  setTimeout(() => {
    toastVisible.value = false;
  }, 1500);
}

async function copyPopover() {
  if (!popover.value) return;
  await copyText(popover.value.text);
  toastVisible.value = true;
  setTimeout(() => {
    toastVisible.value = false;
  }, 1500);
}

function closeColHeaderMenu() {
  colHeaderMenu.value = null;
  colHeaderMenuStyle.value = {};
}

function positionColHeaderMenu(anchorEl) {
  if (!anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const margin = 8;
  colHeaderMenuStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${Math.min(rect.left, window.innerWidth - 120 - margin)}px`,
    zIndex: 10060,
  };
}

function openColHeaderMenu(col, event) {
  closePopover();
  closeCodeValueModal();
  colPickerOpen.value = false;
  if (colHeaderMenu.value?.col === col) {
    closeColHeaderMenu();
    return;
  }
  const anchor = event.currentTarget || event.target;
  colHeaderMenu.value = { col };
  nextTick(() => positionColHeaderMenu(anchor));
}

function hideColumnFromMenu() {
  if (!colHeaderMenu.value) return;
  hideColumn(colHeaderMenu.value.col);
  closeColHeaderMenu();
}

function onColumnPickerChange(col, event) {
  const checked = event.target.checked;
  if (!checked && shownColumnsCount.value <= 1) {
    event.target.checked = true;
    return;
  }
  setColumnShown(col, checked);
}

function updateColPickerPosition() {
  const el = colPickerAnchorRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const maxH = Math.min(360, window.innerHeight - rect.bottom - 16);
  colPickerStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    right: `${Math.max(marginFromRight(rect), 8)}px`,
    left: 'auto',
    minWidth: `${Math.max(rect.width, 200)}px`,
    maxWidth: `${Math.min(320, window.innerWidth - 16)}px`,
    maxHeight: `${Math.max(maxH, 120)}px`,
    zIndex: 10055,
  };
}

function marginFromRight(anchorRect) {
  return window.innerWidth - anchorRect.right;
}

function toggleColPicker() {
  closeColHeaderMenu();
  closePopover();
  colPickerOpen.value = !colPickerOpen.value;
  if (colPickerOpen.value) {
    nextTick(() => updateColPickerPosition());
  }
}

function closeColPicker() {
  colPickerOpen.value = false;
}

function onPageSizeChange() {
  currentPage.value = 1;
  closePopover();
  closeCodeValueModal();
  closeColHeaderMenu();
  closeColPicker();
  scrollRef.value?.scrollTo({ top: 0 });
}

function goToPage(page) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  closePopover();
  closeCodeValueModal();
  emit('page-change', page);
  scrollRef.value?.scrollTo({ top: 0 });
}

function colWidthStyle(col) {
  const w = colWidths.value[col];
  return w ? { width: `${w}px`, minWidth: `${w}px` } : undefined;
}

function onColDragStart(col, event) {
  if (
    event.target.closest('.resize-handle') ||
    event.target.closest('.col-header-label')
  ) {
    event.preventDefault();
    return;
  }
  closeColHeaderMenu();
  dragCol.value = col;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', col);
}

function onColDragEnd() {
  dragCol.value = null;
  dragOverCol.value = null;
}

function onColDragOver(col, event) {
  event.preventDefault();
  if (dragCol.value && dragCol.value !== col) dragOverCol.value = col;
}

function onColDragLeave(col) {
  if (dragOverCol.value === col) dragOverCol.value = null;
}

function onColDrop(targetCol, event) {
  event.preventDefault();
  const from = dragCol.value || event.dataTransfer.getData('text/plain');
  dragCol.value = null;
  dragOverCol.value = null;
  if (!from || from === targetCol) return;

  const order = [...visibleColumns.value];
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(targetCol);
  if (fromIdx < 0 || toIdx < 0) return;
  order.splice(fromIdx, 1);
  order.splice(toIdx, 0, from);
  columnOrder.value = order;
  recheckAllOverflow();
}

function startResize(col, event) {
  const th = event.target.closest('th');
  if (!th) return;
  resizing = {
    col,
    startX: event.clientX,
    startWidth: th.offsetWidth,
  };
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', stopResize);
}

function onResizeMove(event) {
  if (!resizing) return;
  const delta = event.clientX - resizing.startX;
  const next = Math.max(80, resizing.startWidth + delta);
  colWidths.value = { ...colWidths.value, [resizing.col]: next };
}

function stopResize() {
  resizing = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', stopResize);
  recheckAllOverflow();
}

function onDocumentClick(e) {
  if (!e.target.closest('.cell-popover') && !e.target.closest('.cell-content')) {
    closePopover();
  }
  if (
    !e.target.closest('.result-col-picker-dropdown') &&
    !e.target.closest('.result-col-picker')
  ) {
    closeColPicker();
  }
  if (
    !e.target.closest('.col-header-menu') &&
    !e.target.closest('.col-header-label')
  ) {
    closeColHeaderMenu();
  }
}

function onWindowChange() {
  if (popover.value) positionPopover();
  if (colPickerOpen.value) updateColPickerPosition();
  if (colHeaderMenu.value) {
    /* 滚动时关闭，避免错位 */
    closeColHeaderMenu();
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('resize', onWindowChange);
  scrollRef.value?.addEventListener('scroll', onWindowChange, { passive: true });
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('resize', onWindowChange);
  scrollRef.value?.removeEventListener('scroll', onWindowChange);
  closePopover();
  closeCodeValueModal();
  closeColPicker();
  closeColHeaderMenu();
});
</script>

<style scoped>
.result-table-wrap {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
}

.result-table-wrap :deep(.table-header) {
  padding: 4px 12px;
  min-height: 0;
}

.result-table-wrap :deep(.table-title) {
  font-size: 12px;
  line-height: 1.25;
}

.result-table-wrap :deep(.table-count) {
  font-size: 12px;
}

.result-table-wrap :deep(.col-toggle-btn) {
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.2;
}

.result-table-wrap :deep(.col-toggle-wrap .btn) {
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.2;
}

.result-table-wrap :deep(.col-header-draggable) {
  cursor: grab;
  user-select: none;
}

.result-table-wrap :deep(.col-header-draggable.col-dragging) {
  opacity: 0.55;
  cursor: grabbing;
}

.result-table-wrap :deep(.col-header-draggable.col-drag-over) {
  outline: 2px dashed var(--accent-blue);
  outline-offset: -2px;
}

.result-table-wrap :deep(.col-header-label) {
  display: inline-block;
  padding-right: 4px;
  cursor: pointer;
  border-radius: 2px;
}

.result-table-wrap :deep(.col-header-label:hover) {
  color: var(--accent);
}

.col-picker-summary {
  margin-left: 4px;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.col-picker-arrow {
  margin-left: 2px;
  font-size: 10px;
}

.result-col-picker {
  position: relative;
}

.result-table-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
}

.page-size-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.page-size-label {
  white-space: nowrap;
}

.page-size-select {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}

.page-size-select:hover {
  border-color: var(--accent);
}

.page-size-select:focus {
  outline: 2px solid rgba(37, 99, 235, 0.35);
  outline-offset: 1px;
}

.cell-link {
  position: relative;
  padding-right: 24px;
  cursor: pointer;
}

.cell-link:hover .cell-link-text {
  color: #2563eb;
}

.cell-link-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: var(--result-cell-max-width, 21em);
}

.link-icon {
  position: absolute;
  right: 4px;
  top: 4px;
  font-size: 12px;
  line-height: 1;
  color: #2563eb;
  pointer-events: none;
}

.cell-group {
  font-weight: 500;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cell-copy-btn-static {
  opacity: 0;
}

.cell-inner:hover .cell-copy-btn-static {
  opacity: 1;
}
</style>

<style>
.result-col-picker-dropdown {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  overflow: hidden;
}

.result-col-picker-title {
  padding: 4px 12px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}

.result-col-picker-list {
  overflow: auto;
  padding: 4px 0;
}

.result-col-picker-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.result-col-picker-item:hover {
  background: var(--accent-light, rgba(37, 99, 235, 0.06));
}

.result-col-picker-label {
  flex: 1;
  line-height: 1.35;
  word-break: break-all;
}

.col-header-menu {
  min-width: 88px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.12);
}

.col-header-menu-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  color: var(--text);
}

.col-header-menu-item:hover:not(:disabled) {
  background: var(--accent-light, rgba(37, 99, 235, 0.08));
  color: var(--accent);
}

.col-header-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
