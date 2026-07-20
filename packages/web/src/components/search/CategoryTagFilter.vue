<template>
  <div class="category-tag-filter" :class="{ 'category-tag-filter--full': variant === 'full' }">
    <span v-if="label" class="category-tag-filter-label">{{ label }}</span>
    <div class="category-tag-list" role="group" :aria-label="label || '资料类型'">
      <button
        v-for="cat in options"
        :key="cat.code"
        type="button"
        class="category-tag"
        :class="{ active: isActive(cat.code) }"
        @click="toggle(cat.code)"
      >
        {{ cat.label }}
      </button>
    </div>
    <button v-if="hasSelection" type="button" class="category-tag-clear" @click="clearAll">
      全部
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { MATERIAL_CATEGORIES } from '../../constants/materialCategories.js';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => MATERIAL_CATEGORIES },
  label: { type: String, default: '' },
  variant: { type: String, default: 'inline' },
});

const emit = defineEmits(['update:modelValue', 'change']);

const hasSelection = computed(() => props.modelValue.length > 0);

function isActive(code) {
  if (!props.modelValue.length) return true;
  return props.modelValue.includes(code);
}

function toggle(code) {
  let next;
  if (!props.modelValue.length) {
    next = [code];
  } else if (props.modelValue.includes(code)) {
    next = props.modelValue.filter((c) => c !== code);
  } else {
    next = [...props.modelValue, code];
  }
  emit('update:modelValue', next);
  emit('change', next);
}

function clearAll() {
  emit('update:modelValue', []);
  emit('change', []);
}
</script>

<style scoped>
.category-tag-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin-top: 12px;
}

.category-tag-filter--full {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}

.category-tag-filter-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.category-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.category-tag-filter--full .category-tag-list {
  width: 100%;
  flex-wrap: nowrap;
  gap: 8px;
}

.category-tag {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.category-tag-filter--full .category-tag {
  flex: 1 1 0;
  min-width: 0;
  padding: 10px 8px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.category-tag:hover {
  border-color: var(--accent);
  color: var(--text);
}

.category-tag.active {
  background: var(--accent-light, #eff6ff);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.category-tag-clear {
  border: none;
  background: none;
  color: var(--accent-blue);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  align-self: flex-end;
}

.category-tag-clear:hover {
  text-decoration: underline;
}

@media (max-width: 720px) {
  .category-tag-filter--full .category-tag-list {
    flex-wrap: wrap;
  }

  .category-tag-filter--full .category-tag {
    flex: 1 1 calc(33.33% - 8px);
  }
}
</style>
