<template>
  <table class="mapping-table">
    <thead>
      <tr>
        <th class="col-order" title="拖动调整顺序">#</th>
        <th>Excel 列名</th>
        <th>标准字段</th>
        <th class="center" title="勾选后搜索结果默认展示该列">默认展示</th>
        <th>必填</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!rows.length">
        <td colspan="6" class="empty-cell">暂无映射，请点击下方「添加映射」</td>
      </tr>
      <tr
        v-for="(row, index) in rows"
        :key="row._rowId"
        class="mapping-row"
        :class="{
          dragging: dragFromIndex === index,
          'drag-over': dragOverIndex === index && dragFromIndex !== index,
        }"
        @dragover.prevent="onDragOver(index)"
        @drop.prevent="onDrop(index)"
      >
        <td class="col-order">
          <button
            type="button"
            class="drag-handle"
            draggable="true"
            title="拖动排序"
            aria-label="拖动排序"
            @dragstart="onDragStart(index, $event)"
            @dragend="onDragEnd"
          >
            ⋮⋮
          </button>
          <span class="order-num">{{ index + 1 }}</span>
        </td>
        <td>
          <input v-model="row.originalColumn" type="text" class="cell-input" />
        </td>
        <td class="mapping-cell">
          <StandardFieldCombobox v-model="row.standardField" :fields="fields" />
        </td>
        <td class="center">
          <input v-model="row.defaultDisplay" type="checkbox" title="勾选后搜索结果默认展示该列" />
        </td>
        <td class="center">
          <input v-model="row.isRequired" type="checkbox" />
        </td>
        <td>
          <button type="button" class="link-btn" @click="removeRow(index)">移除</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
import { computed, ref } from 'vue';
import StandardFieldCombobox from './StandardFieldCombobox.vue';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  fields: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue']);

const rows = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const dragFromIndex = ref(null);
const dragOverIndex = ref(null);

function removeRow(index) {
  const next = [...rows.value];
  next.splice(index, 1);
  rows.value = next;
}

function onDragStart(index, event) {
  dragFromIndex.value = index;
  dragOverIndex.value = index;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(index));
}

function onDragOver(index) {
  if (dragFromIndex.value === null) return;
  dragOverIndex.value = index;
}

function onDrop(targetIndex) {
  const from = dragFromIndex.value;
  if (from === null || from === targetIndex) {
    onDragEnd();
    return;
  }
  const next = [...rows.value];
  const [moved] = next.splice(from, 1);
  next.splice(targetIndex, 0, moved);
  rows.value = next;
  onDragEnd();
}

function onDragEnd() {
  dragFromIndex.value = null;
  dragOverIndex.value = null;
}
</script>

<style scoped>
.mapping-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-top: 8px;
}

.mapping-table th,
.mapping-table td {
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  text-align: left;
}

.col-order {
  width: 56px;
  text-align: center;
  white-space: nowrap;
}

.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 12px;
  line-height: 1;
  cursor: grab;
  vertical-align: middle;
}

.drag-handle:hover {
  background: #e5e7eb;
  color: #374151;
}

.drag-handle:active {
  cursor: grabbing;
}

.order-num {
  font-size: 12px;
  color: #9ca3af;
  vertical-align: middle;
}

.mapping-row {
  transition: background-color 0.15s ease;
}

.mapping-row.dragging {
  opacity: 0.45;
}

.mapping-row.drag-over {
  background: #eff6ff;
  box-shadow: inset 0 0 0 2px #93c5fd;
}

.mapping-cell {
  overflow: visible;
  position: relative;
  min-width: 240px;
  vertical-align: top;
}

.cell-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.center {
  text-align: center;
}

.empty-cell {
  text-align: center;
  color: #9ca3af;
  padding: 16px;
}

.link-btn {
  border: none;
  background: none;
  color: #2563eb;
  cursor: pointer;
  padding: 0 4px;
}
</style>
