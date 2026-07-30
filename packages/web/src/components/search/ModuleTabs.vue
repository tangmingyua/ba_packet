<template>
  <div class="module-tabs">
    <button
      type="button"
      class="module-tabs-scroll left"
      aria-label="向左滚动"
      @click="scroll(-1)"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>

    <div ref="listRef" class="module-tabs-list" @wheel.prevent="onWheel">
      <button
        v-for="m in options"
        :key="m.code"
        type="button"
        class="module-tab"
        :class="{ active: modelValue === m.code }"
        :aria-selected="modelValue === m.code"
        role="tab"
        @click="select(m.code)"
      >
        {{ m.name }}
      </button>
    </div>

    <button
      type="button"
      class="module-tabs-scroll right"
      aria-label="向右滚动"
      @click="scroll(1)"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue', 'change']);

const listRef = ref(null);

function select(code) {
  emit('update:modelValue', code);
  emit('change', code);
}

function scroll(direction) {
  const el = listRef.value;
  if (!el) return;
  const step = el.clientWidth * 0.6;
  el.scrollBy({ left: direction * step, behavior: 'smooth' });
}

function onWheel(e) {
  const el = listRef.value;
  if (!el) return;
  const delta = e.deltaY || e.deltaX;
  if (!delta) return;
  e.preventDefault();
  el.scrollBy({ left: delta, behavior: 'auto' });
}
</script>

<style scoped>
.module-tabs {
  display: flex;
  align-items: stretch;
  gap: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  overflow: hidden;
  flex-shrink: 0;
  min-height: 28px;
}

.module-tabs-scroll {
  flex-shrink: 0;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-right: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  padding: 0;
}

.module-tabs-scroll.right {
  border-right: none;
  border-left: 1px solid var(--border);
}

.module-tabs-scroll:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text);
}

.module-tabs-scroll:disabled {
  opacity: 0.4;
  cursor: default;
}

.module-tabs-list {
  flex: 1;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 3px 4px 0;
  align-items: flex-end;
  min-height: 28px;
}

.module-tabs-list::-webkit-scrollbar {
  display: none;
}

.module-tab {
  flex-shrink: 0;
  padding: 4px 12px 5px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  line-height: 1.4;
  min-height: 26px;
}

.module-tab:hover {
  background: rgba(255, 255, 255, 0.5);
  color: var(--text);
}

.module-tab.active {
  background: var(--bg);
  color: var(--text);
  border-color: var(--border);
  font-weight: 600;
  box-shadow: 0 -2px 6px rgba(15, 23, 42, 0.04);
  padding-bottom: 5px;
  margin-bottom: -1px;
  z-index: 1;
}
</style>
