<template>
  <div class="table-wrap result-table-wrap">
    <div class="table-header">
      <span class="table-title">
        {{ title }} <span class="table-count">{{ totalCount }}</span> 条
      </span>
      <div class="col-toggle-wrap">
        <button type="button" class="btn" :disabled="!totalCount" @click="exportCsv">导出 CSV</button>
        <button
          type="button"
          class="col-toggle-btn"
          :class="{ expanded: extraColsVisible }"
          :disabled="!secondaryCols.length"
          @click="toggleExtraCols"
        >
          <span>{{ extraColsVisible ? '▾' : '▸' }}</span>
          {{ extraColsVisible ? ' 收起次要列' : ' 展开全部列' }}
        </button>
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
              v-for="col in visibleColumns"
              :key="col"
              :class="{ 'col-hidden': isColHidden(col) }"
              :style="colWidthStyle(col)"
            >
              <span>{{ col }}</span>
              <div class="resize-handle" @mousedown.prevent="startResize(col, $event)" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIdx) in pageRows" :key="rowIdx">
            <td
              v-for="col in visibleColumns"
              :key="col"
              :class="cellClass(col)"
            >
              <template v-if="isTruncatable(col)">
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
                <div class="cell-inner">
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
                <div class="cell-inner">
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

    <div v-if="totalPages > 1" class="pagination">
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
      <button type="button" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">
        下一页
      </button>
    </div>

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
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import TruncatableCell from './TruncatableCell.vue';
import {
  PAGE_SIZE,
  buildPageList,
  copyText,
  exportRowsCsv,
  highlightKeyword,
  paginateRows,
} from '../../composables/useDynamicTable.js';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columnMeta: { type: Object, required: true },
  keyword: { type: String, default: '' },
  title: { type: String, default: '查询结果' },
  emptyText: { type: String, default: '未找到匹配结果' },
  pageSize: { type: Number, default: PAGE_SIZE },
});

const emit = defineEmits(['page-change']);

const currentPage = ref(1);
const extraColsVisible = ref(false);
const expandedCell = ref('');
const popover = ref(null);
const popoverStyle = ref({});
const toastVisible = ref(false);
const colWidths = ref({});
const scrollRef = ref(null);
const popoverRef = ref(null);
const cellRefs = new Map();
let resizing = null;

const displayCols = computed(() => props.columnMeta.displayCols || []);
const secondaryCols = computed(() => props.columnMeta.secondaryCols || []);
const truncatableLabels = computed(() => props.columnMeta.truncatableLabels || []);
const descLabels = computed(() => props.columnMeta.descLabels || []);
const codeLabels = computed(() => props.columnMeta.codeLabels || []);
const groupLabels = computed(() => props.columnMeta.groupLabels || []);
const highlightLabels = computed(() => props.columnMeta.highlightLabels || []);

const paginated = computed(() => paginateRows(props.rows, currentPage.value, props.pageSize));
const pageRows = computed(() => paginated.value.rows);
const totalCount = computed(() => paginated.value.total);
const totalPages = computed(() => paginated.value.totalPages);
const pageList = computed(() => buildPageList(currentPage.value, totalPages.value));
const visibleColumns = computed(() => displayCols.value);

watch(
  () => props.rows,
  () => {
    currentPage.value = 1;
    closePopover();
    extraColsVisible.value = false;
    cellRefs.clear();
  }
);

watch(extraColsVisible, () => recheckAllOverflow());

watch(colWidths, () => recheckAllOverflow(), { deep: true });

function isColHidden(col) {
  return !extraColsVisible.value && secondaryCols.value.includes(col);
}

function cellClass(col) {
  return {
    'col-hidden': isColHidden(col),
    truncatable: isTruncatable(col),
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

function toggleExtraCols() {
  extraColsVisible.value = !extraColsVisible.value;
  closePopover();
}

function goToPage(page) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  closePopover();
  emit('page-change', page);
  scrollRef.value?.scrollTo({ top: 0 });
}

function exportCsv() {
  exportRowsCsv(
    props.rows,
    displayCols.value,
    `${props.title}_${new Date().toISOString().slice(0, 10)}.csv`
  );
}

function colWidthStyle(col) {
  const w = colWidths.value[col];
  return w ? { width: `${w}px`, minWidth: `${w}px` } : undefined;
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
}

function onWindowChange() {
  if (popover.value) positionPopover();
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
});
</script>

<style scoped>
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
