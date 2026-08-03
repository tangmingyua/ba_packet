<template>
  <div class="module-category-cards">
    <div class="cards-row" role="group" aria-label="资料类型标签">
      <button
        v-for="cat in options"
        :key="cat.code"
        type="button"
        class="category-card"
        :class="{
          selected: isSelected(cat.code),
          disabled: isDisabled(cat),
        }"
        :style="cardStyle(cat.code)"
        :aria-pressed="isSelected(cat.code)"
        :disabled="isDisabled(cat)"
        :title="isDisabled(cat) ? '当前主类下暂无该类型子类' : cat.label"
        @click="toggle(cat.code)"
      >
        <span v-if="isSelected(cat.code)" class="card-check" aria-hidden="true">✓</span>
        <span class="card-icon">{{ theme(cat.code).icon }}</span>
        <span class="card-label">{{ cat.label }}</span>
        <span class="card-count">{{ cat.count ?? 0 }}</span>
      </button>
    </div>
    <div v-if="options.length" class="cards-actions">
      <button v-if="!allSelected" type="button" class="cards-action" @click="selectAll">
        全选
      </button>
      <button v-if="hasSelection" type="button" class="cards-action muted" @click="clearAll">
        清空
      </button>
    </div>
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

const selectableOptions = computed(() => props.options.filter((o) => !isDisabled(o)));

const allSelected = computed(() => {
  const list = selectableOptions.value;
  if (!list.length) return false;
  const selected = new Set(props.modelValue);
  return list.every((o) => selected.has(o.code));
});

function isDisabled(cat) {
  return cat?.hasSubtype === false;
}

function isSelected(code) {
  return props.modelValue.includes(code);
}

function toggle(code) {
  const cat = props.options.find((o) => o.code === code);
  if (cat && isDisabled(cat)) return;
  const next = props.modelValue.includes(code)
    ? props.modelValue.filter((c) => c !== code)
    : [...props.modelValue, code];
  emit('update:modelValue', next);
  emit('change', next);
}

function selectAll() {
  const next = selectableOptions.value.map((o) => o.code);
  emit('update:modelValue', next);
  emit('change', next);
}

function clearAll() {
  emit('update:modelValue', []);
  emit('change', []);
}

function theme(code) {
  return getCategoryCardTheme(code);
}

function cardStyle(code) {
  const t = theme(code);
  return { '--card-bg': t.bg, '--card-text': t.text || '#fff' };
}
</script>

<style scoped>
.module-category-cards {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.cards-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 6px;
  align-items: stretch;
}

.category-card {
  position: relative;
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 6px 5px 5px;
  background: var(--card-bg);
  color: var(--card-text);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 60px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease,
    filter 0.15s ease;
}

.category-card:not(.selected):not(.disabled) {
  filter: saturate(0.72) brightness(0.94);
  opacity: 0.82;
}

.category-card.disabled {
  cursor: not-allowed;
  filter: grayscale(0.85) brightness(0.72);
  opacity: 0.55;
  box-shadow: none;
}

.category-card:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  filter: none;
  opacity: 1;
}

.category-card.selected {
  border-color: #fff;
  box-shadow:
    0 0 0 3px rgba(15, 23, 42, 0.55),
    0 0 0 5px rgba(255, 255, 255, 0.95),
    0 6px 16px rgba(15, 23, 42, 0.22);
  transform: translateY(-2px) scale(1.03);
  filter: none;
  opacity: 1;
  z-index: 1;
}

.card-check {
  position: absolute;
  top: 4px;
  right: 5px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  color: #111827;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.card-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.card-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.card-count {
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.cards-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 2px;
}

.cards-action {
  border: none;
  background: none;
  color: var(--accent-blue);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
}

.cards-action.muted {
  color: var(--text-muted);
}

.cards-action:hover {
  text-decoration: underline;
}
</style>
