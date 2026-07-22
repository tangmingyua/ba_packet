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
import { buildMergeRenderMap, formatMatrixCell } from '../../utils/formTemplateMatrix.js';
import { shouldSearchCell } from '../../utils/formTemplateSearchScope.js';
import { isClickableIndicatorCell } from '../../utils/formTemplateIndicator.js';

const props = defineProps({
  matrix: { type: Array, default: () => [] },
  merges: { type: Array, default: () => [] },
  /** @deprecated 优先使用 highlightCells */
  highlightKeyword: { type: String, default: '' },
  highlightCells: { type: Array, default: () => [] },
  focusCell: { type: Object, default: null },
  selectedCell: { type: Object, default: null },
  enableIndicatorClick: { type: Boolean, default: false },
});

const emit = defineEmits(['cell-click']);

const wrapRef = ref(null);
const renderMap = computed(() => buildMergeRenderMap(props.merges));

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

function cellClass(r, c) {
  const classes = [];
  if (highlightSet.value.has(`${r},${c}`)) classes.push('cell-hit');
  if (
    props.focusCell &&
    props.focusCell.row === r &&
    props.focusCell.col === c
  ) {
    classes.push('cell-focus');
  }
  if (
    props.selectedCell &&
    props.selectedCell.row === r &&
    props.selectedCell.col === c
  ) {
    classes.push('cell-selected');
  }
  if (props.enableIndicatorClick && isClickableIndicatorCell(props.matrix, r, c)) {
    classes.push('cell-clickable');
  }
  return classes;
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
  font-size: 12px;
  min-width: 100%;
}

.form-template-matrix td {
  border: 1px solid #d1d5db;
  padding: 4px 8px;
  vertical-align: middle;
  white-space: pre-wrap;
  word-break: break-word;
  min-width: 48px;
  max-width: 320px;
  color: var(--text);
  background: #fff;
}

.form-template-matrix tr:nth-child(-n + 6) td {
  background: #f9fafb;
  font-weight: 500;
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
