<template>
  <div ref="wrapRef" class="form-template-matrix-wrap">
    <table class="form-template-matrix">
      <colgroup>
        <col
          v-for="(w, c) in effectiveColWidths"
          :key="c"
          :style="{ width: `${w}px`, minWidth: `${w}px` }"
        />
      </colgroup>
      <tbody>
        <tr
          v-for="(row, r) in matrix"
          :key="r"
          :style="rowStyle(r)"
        >
          <template v-for="(cell, c) in row" :key="`${r}-${c}`">
            <td
              v-if="!isCovered(r, c)"
              :data-row="r"
              :data-col="c"
              :rowspan="cellSpan(r, c)?.rowspan"
              :colspan="cellSpan(r, c)?.colspan"
              :class="cellClass(r, c)"
              :style="cellStyle(r, c)"
              @click="onCellClick(r, c, cell, $event)"
            >
              {{ formatCell(cell) }}
            </td>
          </template>
        </tr>
      </tbody>
    </table>
    <Teleport to="body">
      <div
        v-if="fullTextCell"
        class="cell-fulltext-overlay"
        @click.self="fullTextCell = null"
      >
        <div class="cell-fulltext-card" role="dialog" aria-modal="true" @click.stop>
          <div class="cell-fulltext-header">
            <span>单元格完整内容</span>
            <button
              type="button"
              class="cell-fulltext-close"
              aria-label="关闭"
              @click="fullTextCell = null"
            >
              关闭
            </button>
          </div>
          <div class="cell-fulltext-body">
            <div>{{ fullTextCell.text }}</div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { formatMatrixCell } from '../../utils/formTemplateMatrix.js';
import {
  buildFormTemplateLayout,
  buildMergeRenderMap,
  getLayoutCellPresentation,
} from '../../utils/formTemplateLayout.js';
import { shouldSearchCell } from '../../utils/formTemplateSearchScope.js';
import { isClickableIndicatorCell } from '../../utils/formTemplateIndicator.js';

const props = defineProps({
  matrix: { type: Array, default: () => [] },
  merges: { type: Array, default: () => [] },
  /** 导入时预计算的展示布局（方案 B） */
  layout: { type: Object, default: null },
  highlightKeyword: { type: String, default: '' },
  highlightCells: { type: Array, default: () => [] },
  focusCell: { type: Object, default: null },
  selectedCell: { type: Object, default: null },
  enableIndicatorClick: { type: Boolean, default: false },
  /** 是否允许点击普通单元格弹出完整内容（1104 表样不需要） */
  enableCellFullText: { type: Boolean, default: true },
});

const emit = defineEmits(['cell-click']);

const wrapRef = ref(null);
const fullTextCell = ref(null);
const truncatedCells = ref(new Set());
const renderMap = computed(() => buildMergeRenderMap(props.merges));
const effectiveLayout = computed(() => {
  if (props.layout?.kinds?.length) return props.layout;
  return buildFormTemplateLayout(props.matrix, props.merges);
});

const effectiveColWidths = computed(() => effectiveLayout.value.colWidths || []);
const effectiveRowHeights = computed(() => effectiveLayout.value.rowHeights || []);

const highlightSet = computed(() => {
  if (props.highlightCells?.length) {
    return new Set(props.highlightCells.map((h) => `${h.row},${h.col}`));
  }
  const q = String(props.highlightKeyword || '').trim().toLowerCase();
  if (!q) return new Set();
  const set = new Set();
  props.matrix.forEach((row, r) => {
    (row || []).forEach((cell, c) => {
      if (!shouldSearchCell(props.matrix, r, c)) return;
      if (formatMatrixCell(cell).toLowerCase().includes(q)) {
        set.add(`${r},${c}`);
      }
    });
  });
  return set;
});

function isCovered(r, c) {
  return renderMap.value.covered.has(`${r},${c}`);
}

function cellSpan(r, c) {
  return renderMap.value.spanAt.get(`${r},${c}`);
}

function formatCell(value) {
  return formatMatrixCell(value);
}

function cellPresentation(r, c) {
  return getLayoutCellPresentation(effectiveLayout.value, renderMap.value, r, c);
}

function cellClass(r, c) {
  const classes = [];
  const { kind } = cellPresentation(r, c);
  if (kind && kind !== 'empty') {
    classes.push(`cell-kind-${kind}`);
  }
  if (highlightSet.value.has(`${r},${c}`)) classes.push('cell-hit');
  if (props.focusCell && props.focusCell.row === r && props.focusCell.col === c) {
    classes.push('cell-focus');
  }
  if (props.selectedCell && props.selectedCell.row === r && props.selectedCell.col === c) {
    classes.push('cell-selected');
  }
  if (props.enableIndicatorClick && isClickableIndicatorCell(props.matrix, r, c)) {
    classes.push('cell-clickable');
  }
  if (props.enableCellFullText && truncatedCells.value.has(`${r},${c}`)) {
    classes.push('cell-truncated');
  }
  const heights = effectiveLayout.value.rowHeights || [];
  const widths = effectiveLayout.value.colWidths || [];
  const span = cellSpan(r, c) || { rowspan: 1, colspan: 1 };
  let fixed = true;
  let fixedH = 0;
  for (let i = 0; i < span.rowspan; i += 1) {
    const h = heights[r + i] ?? 0;
    if (h <= 0) {
      fixed = false;
      break;
    }
    fixedH += h;
  }
  if (fixed && fixedH > 0) {
    classes.push('cell-fixed-height');
  }
  let fixedW = true;
  let totalW = 0;
  for (let j = 0; j < span.colspan; j += 1) {
    const w = widths[c + j] ?? 0;
    if (w <= 0) {
      fixedW = false;
      break;
    }
    totalW += w;
  }
  if (fixedW && totalW > 0) {
    classes.push('cell-fixed-width');
  }
  return classes;
}

function rowStyle(r) {
  const h = effectiveRowHeights.value[r];
  if (!h || h <= 0) return {};
  return {
    height: `${h}px`,
    maxHeight: `${h}px`,
  };
}

function cellStyle(r, c) {
  const { align } = cellPresentation(r, c);
  const span = cellSpan(r, c) || { rowspan: 1, colspan: 1 };
  const { rowspan, colspan } = span;
  const widths = effectiveLayout.value.colWidths || [];
  const heights = effectiveLayout.value.rowHeights || [];

  const style = { textAlign: align };

  let fixedWidth = 0;
  let autoWidth = false;
  for (let j = 0; j < colspan; j += 1) {
    const w = widths[c + j] ?? 0;
    if (w <= 0) {
      autoWidth = true;
      break;
    }
    fixedWidth += w;
  }
  if (!autoWidth && fixedWidth > 0) {
    style.width = `${fixedWidth}px`;
    style.minWidth = `${fixedWidth}px`;
    style.maxWidth = `${fixedWidth}px`;
    style.overflow = 'hidden';
  }

  // 行高：仅当合并范围内的所有行都有 Excel 固定行高时，才把整个单元格锁定为总高度
  let fixedHeight = 0;
  let auto = false;
  for (let i = 0; i < rowspan; i += 1) {
    const h = heights[r + i] ?? 0;
    if (h <= 0) {
      auto = true;
      break;
    }
    fixedHeight += h;
  }
  if (!auto && fixedHeight > 0) {
    style.height = `${fixedHeight}px`;
    style.maxHeight = `${fixedHeight}px`;
    style.overflow = 'hidden';
    style.whiteSpace = 'nowrap';
  } else if (style.overflow === 'hidden') {
    // 仅固定列宽、行高自动时仍截断横向溢出
    style.whiteSpace = 'nowrap';
  }

  return style;
}

function onCellClick(r, c, cell, event) {
  if (props.enableIndicatorClick && isClickableIndicatorCell(props.matrix, r, c)) {
    emit('cell-click', {
      row: r,
      col: c,
      text: formatMatrixCell(cell),
    });
    return;
  }
  if (!props.enableCellFullText) return;
  if (!truncatedCells.value.has(`${r},${c}`)) return;
  const text = formatMatrixCell(cell);
  if (!text) return;
  fullTextCell.value = {
    text,
    row: r,
    col: c,
    x: event?.clientX ?? 0,
    y: event?.clientY ?? 0,
  };
}

function isTdContentTruncated(td) {
  const text = td.textContent?.trim();
  if (!text) return false;
  if (td.scrollHeight > td.clientHeight + 1 || td.scrollWidth > td.clientWidth + 1) {
    return true;
  }
  if (
    !td.classList.contains('cell-fixed-width') &&
    !td.classList.contains('cell-fixed-height')
  ) {
    return false;
  }
  const range = document.createRange();
  range.selectNodeContents(td);
  const { width, height } = range.getBoundingClientRect();
  const style = getComputedStyle(td);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const innerW = td.clientWidth - padX;
  const innerH = td.clientHeight - padY;
  return width > innerW + 1 || height > innerH + 1;
}

function refreshTruncatedCells() {
  const set = new Set();
  const wrap = wrapRef.value;
  if (!wrap || !props.enableCellFullText) {
    truncatedCells.value = set;
    return;
  }
  for (const td of wrap.querySelectorAll('td')) {
    if (!isTdContentTruncated(td)) continue;
    const r = td.getAttribute('data-row');
    const c = td.getAttribute('data-col');
    if (r != null && c != null) {
      set.add(`${r},${c}`);
    }
  }
  truncatedCells.value = set;
}

let resizeObserver = null;

onMounted(() => {
  nextTick(refreshTruncatedCells);
  const wrap = wrapRef.value;
  if (wrap && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      refreshTruncatedCells();
    });
    resizeObserver.observe(wrap);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
  }
});

watch(fullTextCell, (val) => {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = val ? 'hidden' : '';
});

watch(
  () => [
    props.matrix,
    props.layout,
    props.merges,
    props.enableCellFullText,
    effectiveColWidths.value,
    effectiveRowHeights.value,
  ],
  () => nextTick(refreshTruncatedCells),
  { flush: 'post', deep: true }
);

function scrollToCell(row, col) {
  if (row == null || col == null || !wrapRef.value) return;
  const td = wrapRef.value.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
  if (td) {
    td.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }
}

defineExpose({ scrollToCell });
</script>

<style scoped>
.form-template-matrix-wrap {
  overflow: auto;
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
}

.form-template-matrix {
  border-collapse: collapse;
  font-size: 13px;
  width: max-content;
  min-width: 100%;
  table-layout: fixed;
}

.form-template-matrix td {
  border: 1px solid #d1d5db;
  padding: 2px 4px;
  vertical-align: middle;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.35;
  color: var(--text);
  background: #fff;
  box-sizing: border-box;
  font-weight: 400;
}

.form-template-matrix td.cell-fixed-height {
  overflow: hidden;
  text-overflow: ellipsis;
}

.form-template-matrix td.cell-fixed-width {
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-kind-title {
  font-size: 16px;
  background: #eef2ff;
}

.cell-kind-section {
  font-size: 14px;
  background: #f9fafb;
}

.cell-kind-header {
  font-size: 12px;
  background: #f3f4f6;
  color: #374151;
}

.cell-kind-seq {
  color: #4b5563;
}

.cell-kind-label {
  font-size: 13px;
}

.cell-kind-value {
  font-variant-numeric: tabular-nums;
}

.cell-kind-empty {
  background: #fafafa;
}

.cell-fulltext-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  padding: 20px;
  pointer-events: auto;
}

.cell-fulltext-card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  max-width: 720px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cell-fulltext-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}

.cell-fulltext-close {
  border: none;
  background: none;
  color: var(--accent-blue);
  cursor: pointer;
  font-size: 13px;
  padding: 4px 8px;
}

.cell-fulltext-close:hover {
  text-decoration: underline;
}

.cell-fulltext-body {
  padding: 16px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  font-size: 14px;
}

.form-template-matrix td.cell-hit {
  background: #fef9c3 !important;
}

.form-template-matrix td.cell-focus {
  outline: 2px solid var(--accent-blue);
  outline-offset: -2px;
  background: #fde68a !important;
}

.form-template-matrix td.cell-truncated {
  cursor: pointer;
}

.form-template-matrix td.cell-truncated:hover {
  background: #f3f4f6;
}

.form-template-matrix td.cell-clickable {
  cursor: pointer;
}

.form-template-matrix td.cell-clickable:hover {
  background: #eff6ff;
}

.form-template-matrix td.cell-selected {
  background: #dbeafe !important;
  outline: 2px solid #3b82f6;
  outline-offset: -2px;
}
</style>
