<template>
  <div class="module-category-cards">
    <div class="cards-row" role="group" aria-label="资料类型标签">
      <button
        v-for="cat in options"
        :key="cat.code"
        type="button"
        class="category-card"
        :class="{ selected: isSelected(cat.code) }"
        :style="cardStyle(cat.code)"
        :aria-pressed="isSelected(cat.code)"
        @click="toggle(cat.code)"
      >
        <span class="card-icon">{{ theme(cat.code).icon }}</span>
        <span class="card-label">{{ cat.label }}</span>
        <span class="card-count">{{ cat.count ?? 0 }}</span>
      </button>
    </div>
    <button v-if="hasSelection" type="button" class="cards-clear" @click="clearAll">全部标签</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { getCategoryCardTheme } from '../../constants/categoryCardThemes.js';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue', 'change']);

const hasSelection = computed(() => props.modelValue.length > 0);

function theme(code) {
  return getCategoryCardTheme(code);
}

function cardStyle(code) {
  const t = theme(code);
  return { '--card-bg': t.bg, '--card-text': t.text || '#fff' };
}

/** 未选任何标签时视为「全部」选中 */
function isSelected(code) {
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
.module-category-cards {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.cards-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 12px;
  align-items: stretch;
}

.category-card {
  border: 2px solid transparent;
  border-radius: 12px;
  padding: 14px 10px 12px;
  background: var(--card-bg);
  color: var(--card-text);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 108px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.category-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.14);
}

.category-card.selected {
  border-color: rgba(255, 255, 255, 0.85);
  box-shadow:
    0 0 0 2px rgba(17, 24, 39, 0.25),
    0 6px 16px rgba(15, 23, 42, 0.18);
  transform: translateY(-2px);
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
}

.card-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.card-count {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.cards-clear {
  align-self: flex-end;
  border: none;
  background: none;
  color: var(--accent-blue);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
}

.cards-clear:hover {
  text-decoration: underline;
}
</style>
