<template>
  <div ref="wrapRef" class="form-template-matrix-wrap">
    <table class="form-template-matrix">
      <tbody>
        <tr v-for="(row, r) in matrix" :key="r">
          <template v-for="(cell, c) in row" :key="`${r}-${c}`">
            <td
              v-if="!isCovered(r, c)"
              :data-row="r"
              :data-col="c"
              :rowspan="cellSpan(r, c)?.rowspan"
              :colspan="cellSpan(r, c)?.colspan"
              :class="cellClass(r, c)"
              :style="cellStyle(r, c)"
              @click="onCellClick(r, c, cell)"
            >
              {{ formatCell(cell) }}
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
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
});

const emit = defineEmits(['cell-click']);

const wrapRef = ref(null);
const renderMap = computed(() => buildMergeRenderMap(props.merges));
const effectiveLayout = computed(() => {
  if (props.layout?.kinds?.length) return props.layout;
  return buildFormTemplateLayout(props.matrix, props.merges);
});

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
  return classes;
}

function cellStyle(r, c) {
  const { align } = cellPresentation(r, c);
  const width = effectiveLayout.value.colWidths?.[c];
  return {
    textAlign: align,
    ...(width ? { minWidth: `${width}px`, width: `${width}px` } : {}),
  };
}

function onCellClick(r, c, cell) {
  if (!props.enableIndicatorClick) return;
  if (!isClickableIndicatorCell(props.matrix, r, c)) return;
  emit('cell-click', {
    row: r,
    col: c,
    text: formatMatrixCell(cell),
  });
}

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
  padding: 6px 10px;
  vertical-align: middle;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.45;
  color: var(--text);
  background: #fff;
}

.cell-kind-title {
  font-size: 16px;
  font-weight: 600;
  background: #eef2ff;
  padding-top: 10px;
  padding-bottom: 10px;
}

.cell-kind-section {
  font-size: 14px;
  font-weight: 600;
  background: #f9fafb;
}

.cell-kind-header {
  font-size: 12px;
  font-weight: 600;
  background: #f3f4f6;
  color: #374151;
}

.cell-kind-seq {
  font-weight: 500;
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

.form-template-matrix td.cell-hit {
  background: #fef9c3 !important;
}

.form-template-matrix td.cell-focus {
  outline: 2px solid var(--accent-blue);
  outline-offset: -2px;
  background: #fde68a !important;
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
