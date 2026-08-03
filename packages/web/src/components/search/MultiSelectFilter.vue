<template>
  <div class="multi-select-filter" ref="rootRef">
    <div class="multi-select-trigger" :class="{ open: dropdownOpen }" @click="toggleDropdown">
      <span v-if="!selectedLabels.length" class="placeholder">{{ placeholderText }}</span>
      <span v-else class="selected-text">{{ selectedLabels.join('，') }}</span>
      <span class="dropdown-arrow">▾</span>
    </div>
    <Teleport to="body">
      <div
        v-if="dropdownOpen"
        ref="dropdownRef"
        class="multi-select-dropdown multi-select-dropdown-teleport"
        :style="dropdownStyle"
        @click.stop
      >
        <div class="multi-select-search">
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="输入筛选"
            autocomplete="off"
            @keydown.down.prevent="moveHighlight(1)"
            @keydown.up.prevent="moveHighlight(-1)"
            @keydown.enter.prevent="toggleHighlighted"
            @keydown.escape.prevent="closeDropdown"
          />
        </div>
        <div class="multi-select-options">
          <label
            v-for="(opt, idx) in filteredOptions"
            :key="`${opt.value}-${idx}`"
            class="multi-select-option"
            :class="{ active: highlightIndex === idx, selected: opt.selected }"
            @mouseenter="highlightIndex = idx"
            @click.prevent="toggleOption(opt.value)"
          >
            <span class="option-checkbox" aria-hidden="true">
              <input type="checkbox" :checked="opt.selected" tabindex="-1" readonly />
            </span>
            <span class="option-label">{{ opt.label }}</span>
            <span class="option-count">{{ opt.count }}</span>
          </label>
          <p v-if="!props.rows.length" class="multi-select-empty">当前无结果数据</p>
          <p v-else-if="!props.col" class="multi-select-empty">未指定字段</p>
          <p v-else-if="!options.length" class="multi-select-empty">当前结果中该字段均为空值</p>
          <p v-else-if="!filteredOptions.length" class="multi-select-empty">无匹配选项</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import {
  getRowValueForExcelColumn,
  resolveExcelColumnKeyForRows,
} from '../../utils/fieldLabels.js';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  col: { type: String, default: '' },
  placeholder: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue']);

const rootRef = ref(null);
const dropdownRef = ref(null);
const inputRef = ref(null);
const dropdownOpen = ref(false);
const query = ref('');
const highlightIndex = ref(-1);
const dropdownStyle = ref({});

const selectedSet = computed(() => new Set(props.modelValue || []));

const resolvedCol = computed(() => resolveExcelColumnKeyForRows(props.rows, props.col));

const options = computed(() => {
  const col = resolvedCol.value;
  if (!col) return [];
  const counts = new Map();
  for (const row of props.rows) {
    const v = getRowValueForExcelColumn(row, col);
    const key = v === '' ? '（空）' : v;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const list = [];
  for (const [label, count] of counts) {
    const value = label === '（空）' ? '' : label;
    list.push({ label, value, count, selected: selectedSet.value.has(value) });
  }
  return list.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
});

const filteredOptions = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return options.value;
  return options.value.filter((opt) => opt.label.toLowerCase().includes(q));
});

const selectedLabels = computed(() =>
  (props.modelValue || [])
    .map((v) => (v === '' ? '（空）' : v))
    .filter((v) => options.value.some((o) => o.label === v || o.value === v))
);

const placeholderText = computed(() => props.placeholder || `筛选 ${props.col}`);

watch(
  () => filteredOptions.value,
  () => {
    highlightIndex.value = filteredOptions.value.length ? 0 : -1;
  },
  { immediate: true }
);

watch(dropdownOpen, (open) => {
  if (open) {
    query.value = '';
    nextTick(() => {
      updateDropdownPosition();
      inputRef.value?.focus();
    });
  }
});

function updateDropdownPosition() {
  const el = rootRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const maxW = Math.min(320, window.innerWidth - rect.left - 8);
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    minWidth: `${Math.max(rect.width, 160)}px`,
    maxWidth: `${Math.max(maxW, rect.width)}px`,
    zIndex: 10050,
  };
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value;
}

function closeDropdown() {
  dropdownOpen.value = false;
}

function toggleOption(value) {
  const next = new Set(props.modelValue || []);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  emit('update:modelValue', [...next]);
}

function moveHighlight(step) {
  const len = filteredOptions.value.length;
  if (!len) return;
  let idx = highlightIndex.value + step;
  if (idx < 0) idx = len - 1;
  if (idx >= len) idx = 0;
  highlightIndex.value = idx;
}

function toggleHighlighted() {
  const opt = filteredOptions.value[highlightIndex.value];
  if (opt) toggleOption(opt.value);
}

function onClickOutside(e) {
  const root = rootRef.value;
  const panel = dropdownRef.value;
  if (root?.contains(e.target) || panel?.contains(e.target)) return;
  closeDropdown();
}

function onReposition() {
  if (dropdownOpen.value) updateDropdownPosition();
}

watch(dropdownOpen, (open) => {
  if (open) {
    document.addEventListener('click', onClickOutside, { capture: true });
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
  } else {
    document.removeEventListener('click', onClickOutside, { capture: true });
    window.removeEventListener('scroll', onReposition, true);
    window.removeEventListener('resize', onReposition);
  }
});

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside, { capture: true });
  window.removeEventListener('scroll', onReposition, true);
  window.removeEventListener('resize', onReposition);
});
</script>

<style scoped>
.multi-select-filter {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  min-width: 120px;
  max-width: 260px;
}

.multi-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  background: var(--bg-card, #fff);
  cursor: pointer;
  font-size: 12px;
  min-height: 26px;
}

.multi-select-trigger:hover {
  border-color: var(--accent-blue, #2563eb);
}

.multi-select-trigger.open {
  border-color: var(--accent-blue, #2563eb);
}

.selected-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.placeholder {
  color: var(--text-muted, #9ca3af);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-arrow {
  font-size: 10px;
  color: var(--text-secondary, #6b7280);
  flex-shrink: 0;
}

.multi-select-dropdown {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.multi-select-search {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.multi-select-search input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 4px;
  font-size: 12px;
  box-sizing: border-box;
}

.multi-select-options {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px 0;
}

.multi-select-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.multi-select-option:hover,
.multi-select-option.active {
  background: var(--bg-active, #eff6ff);
}

.option-checkbox {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
}

.option-checkbox input[type='checkbox'] {
  pointer-events: none;
  margin: 0;
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.option-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-count {
  color: var(--text-muted, #9ca3af);
  font-size: 11px;
  flex-shrink: 0;
}

.multi-select-empty {
  padding: 10px;
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  text-align: center;
  margin: 0;
}
</style>
