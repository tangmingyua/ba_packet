<template>
  <div class="sf-combobox">
    <input
      ref="inputRef"
      v-model="query"
      type="text"
      class="sf-input"
      :placeholder="placeholder"
      :title="query"
      autocomplete="off"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput"
      @keydown="onKeydown"
    />
    <ul v-if="open && filteredFields.length" class="sf-list" role="listbox">
      <li class="sf-list-hint">
        共 {{ filteredFields.length }} 个标准字段 · 输入关键字过滤
      </li>
      <li
        v-for="(field, index) in filteredFields"
        :key="field.code"
        role="option"
        :class="{ active: index === activeIndex }"
        :title="`${field.label}（${field.code}）`"
        @mousedown.prevent="selectField(field)"
      >
        <span class="sf-label">{{ field.label }}</span>
        <code class="sf-code">{{ field.code }}</code>
      </li>
    </ul>
    <p v-else-if="open && query.trim()" class="sf-empty">无匹配标准字段</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  fields: { type: Array, default: () => [] },
  placeholder: { type: String, default: '输入中文名或 code 搜索' },
});

const emit = defineEmits(['update:modelValue']);

const inputRef = ref(null);
const query = ref('');
const open = ref(false);
const activeIndex = ref(-1);
const isEditing = ref(false);

const selectedField = computed(() =>
  props.fields.find((f) => f.code === props.modelValue) || null
);

const filteredFields = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = props.fields;
  if (q) {
    list = list.filter(
      (f) => f.code.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)
    );
  }
  return list;
});

function displayText(field) {
  return `${field.label}（${field.code}）`;
}

function syncQueryFromValue() {
  query.value = selectedField.value ? displayText(selectedField.value) : '';
}

watch(
  () => props.modelValue,
  () => {
    if (!isEditing.value) syncQueryFromValue();
  },
  { immediate: true }
);

watch(
  () => props.fields,
  () => {
    if (!isEditing.value) syncQueryFromValue();
  }
);

function onFocus() {
  open.value = true;
  isEditing.value = true;
  activeIndex.value = filteredFields.value.length ? 0 : -1;
  if (selectedField.value) {
    query.value = selectedField.value.label;
    inputRef.value?.select();
  }
}

function onInput() {
  open.value = true;
  activeIndex.value = filteredFields.value.length ? 0 : -1;
  if (!query.value.trim()) {
    emit('update:modelValue', '');
  }
}

function onBlur() {
  setTimeout(() => {
    open.value = false;
    isEditing.value = false;
    resolveQuery();
  }, 120);
}

function resolveQuery() {
  const q = query.value.trim();
  if (!q) {
    emit('update:modelValue', '');
    query.value = '';
    return;
  }

  const lower = q.toLowerCase();
  const exactCode = props.fields.find((f) => f.code.toLowerCase() === lower);
  if (exactCode) {
    emit('update:modelValue', exactCode.code);
    query.value = displayText(exactCode);
    return;
  }

  const exactLabel = props.fields.find((f) => f.label.toLowerCase() === lower);
  if (exactLabel) {
    emit('update:modelValue', exactLabel.code);
    query.value = displayText(exactLabel);
    return;
  }

  const partial = props.fields.filter(
    (f) => f.code.toLowerCase().includes(lower) || f.label.toLowerCase().includes(lower)
  );
  if (partial.length === 1) {
    emit('update:modelValue', partial[0].code);
    query.value = displayText(partial[0]);
    return;
  }

  syncQueryFromValue();
}

function selectField(field) {
  emit('update:modelValue', field.code);
  query.value = displayText(field);
  open.value = false;
  isEditing.value = false;
  activeIndex.value = -1;
}

function onKeydown(event) {
  if (!open.value && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    open.value = true;
    activeIndex.value = filteredFields.value.length ? 0 : -1;
    event.preventDefault();
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!filteredFields.value.length) return;
    activeIndex.value = (activeIndex.value + 1) % filteredFields.value.length;
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!filteredFields.value.length) return;
    activeIndex.value =
      activeIndex.value <= 0 ? filteredFields.value.length - 1 : activeIndex.value - 1;
    return;
  }

  if (event.key === 'Enter') {
    if (open.value && activeIndex.value >= 0 && filteredFields.value[activeIndex.value]) {
      event.preventDefault();
      selectField(filteredFields.value[activeIndex.value]);
    }
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    open.value = false;
    isEditing.value = false;
    syncQueryFromValue();
    inputRef.value?.blur();
  }
}
</script>

<style scoped>
.sf-combobox {
  position: relative;
  min-width: 260px;
}

.sf-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}

.sf-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.sf-list {
  position: absolute;
  z-index: 30;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  margin: 0;
  padding: 4px 0;
  list-style: none;
  max-height: 220px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.sf-list li {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.4;
}

.sf-list li:hover,
.sf-list li.active {
  background: #eff6ff;
}

.sf-list-hint {
  padding: 6px 10px;
  font-size: 12px;
  color: #6b7280;
  background: #f9fafb;
  cursor: default;
  pointer-events: none;
  border-bottom: 1px solid #e5e7eb;
}

.sf-list-hint:hover,
.sf-list-hint.active {
  background: #f9fafb;
}

.sf-label {
  color: #111827;
  word-break: break-word;
  line-height: 1.4;
}

.sf-code {
  font-size: 11px;
  color: #1d4ed8;
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.sf-empty {
  position: absolute;
  z-index: 30;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  margin: 0;
  padding: 10px 12px;
  font-size: 12px;
  color: #9ca3af;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}
</style>
