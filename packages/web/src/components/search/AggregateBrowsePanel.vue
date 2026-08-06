<template>
  <div class="aggregate-browse">
    <p v-if="!items.length" class="message muted">{{ emptyText }}</p>
    <div v-else ref="scrollRef" class="aggregate-browse-table-wrap">
      <table class="aggregate-browse-table">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.label"
              :class="{ 'col-link': isLinkColumn(col.label) }"
            >
              {{ col.label }}
            </th>
            <th class="col-count">条数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in items" :key="idx" class="aggregate-row">
            <td
              v-for="col in columns"
              :key="col.label"
              class="aggregate-data-cell"
              :class="{ 'col-link': isLinkColumn(col.label) }"
            >
              <div
                v-if="isLinkColumn(col.label)"
                role="button"
                tabindex="0"
                class="link-cell-btn"
                :title="cellPlainText(row, col.label)"
                @click="emit('pick', row)"
                @keydown.enter.prevent="emit('pick', row)"
              >
                <TruncatableCell passive :text="cellPlainText(row, col.label)" />
              </div>
              <TruncatableCell
                v-else
                :ref="(el) => setCellRef(cellId(idx, col.label), el)"
                :text="cellPlainText(row, col.label)"
                :active="expandedCell === cellId(idx, col.label)"
                @expand="openPopover($event, idx, col.label, row)"
              />
            </td>
            <td class="col-count">{{ row.count }}</td>
          </tr>
        </tbody>
      </table>
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
        <div class="cell-popover-body">{{ popover.text }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import TruncatableCell from './TruncatableCell.vue';

const props = defineProps({
  columns: { type: Array, default: () => [] },
  items: { type: Array, default: () => [] },
  emptyText: { type: String, default: '暂无去重组合' },
  /** Excel 列名：标准字段一般为 table_name（表名），如「报表」 */
  linkColumnLabel: { type: String, default: '' },
});

const emit = defineEmits(['pick']);

const scrollRef = ref(null);
const popoverRef = ref(null);
const expandedCell = ref('');
const popover = ref(null);
const popoverStyle = ref({});
const cellRefs = new Map();

watch(
  () => props.items,
  () => {
    closePopover();
    cellRefs.clear();
  }
);

function isLinkColumn(label) {
  return Boolean(props.linkColumnLabel && label === props.linkColumnLabel);
}

function cellPlainText(row, label) {
  const v = row.values?.[label];
  if (v === undefined || v === null || v === '') return '';
  return String(v);
}

function cellId(rowIdx, label) {
  return `agg_${rowIdx}_${label.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}`;
}

function setCellRef(id, el) {
  if (el) cellRefs.set(id, el);
  else cellRefs.delete(id);
}

function closePopover() {
  expandedCell.value = '';
  popover.value = null;
  popoverStyle.value = {};
}

async function openPopover(event, rowIdx, colLabel, row) {
  const id = cellId(rowIdx, colLabel);
  const text = cellPlainText(row, colLabel);
  if (!text) return;

  if (expandedCell.value === id) {
    closePopover();
    return;
  }

  const anchor = event.currentTarget.getBoundingClientRect();
  expandedCell.value = id;
  popover.value = {
    id,
    col: colLabel,
    text,
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
  if (top < margin) top = margin;

  popoverStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    maxWidth: `${maxWidth}px`,
    maxHeight: `${maxHeight}px`,
  };
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
.aggregate-browse {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 16px 20px;
}

.aggregate-browse-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.aggregate-browse-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: auto;
}

.aggregate-browse-table th,
.aggregate-browse-table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 8px 12px;
  text-align: left;
  vertical-align: middle;
}

.aggregate-data-cell {
  max-width: var(--result-cell-max-width, 21em);
  overflow: hidden;
}

.aggregate-browse-table th {
  background: #f9fafb;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
  white-space: nowrap;
  word-break: keep-all;
  min-width: max-content;
  vertical-align: bottom;
}

.col-link {
  color: #2563eb;
}

th.col-link {
  font-weight: 600;
}

.col-count {
  width: 72px;
  max-width: 72px;
  text-align: right;
  white-space: nowrap;
  color: inherit;
}

.link-cell-btn {
  display: block;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: #2563eb;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  text-decoration: none;
}

.link-cell-btn :deep(.cell-content) {
  color: #2563eb;
}

.link-cell-btn:hover {
  color: #1d4ed8;
}

.link-cell-btn:hover :deep(.cell-desc),
.link-cell-btn:hover :deep(.cell-content) {
  color: #1d4ed8;
}

.link-cell-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
  border-radius: 2px;
}

.aggregate-row {
  height: var(--result-row-h, 40px);
  max-height: var(--result-row-h, 40px);
}
</style>
