<template>
  <div class="module-category-cards">
    <div class="cards-row" :role="single ? 'radiogroup' : 'group'" aria-label="资料类型标签">
      <button
        v-for="cat in options"
        :key="cat.code"
        type="button"
        class="category-card"
        :class="{
          selected: isSelected(cat.code),
          disabled: isDisabled(cat),
          'has-records': !isDisabled(cat) && (cat.count ?? 0) > 0,
          'no-records': isDisabled(cat) || !(cat.count ?? 0),
        }"
        :aria-pressed="!single && isSelected(cat.code)"
        :aria-checked="single ? isSelected(cat.code) : undefined"
        :role="single ? 'radio' : undefined"
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
    <div v-if="options.length && !single" class="cards-actions">
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
  /** 为 true 时仅允许选中一个标签（再次点击已选标签不会取消） */
  single: { type: Boolean, default: false },
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
  if (props.single) {
    if (props.modelValue.includes(code)) return;
    const next = [code];
    emit('update:modelValue', next);
    emit('change', next);
    return;
  }
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
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 6px 5px 5px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 60px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition:
    box-shadow 0.15s ease,
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.category-card.has-records {
  background-color: #d4e8da;
  color: #245032;
  border-color: #9bc4a8;
}

.category-card.no-records {
  background-color: #e8ebee;
  color: #5a6570;
  border-color: #ced4da;
}

.category-card.disabled {
  background-color: #eceef0;
  color: #9aa3ad;
  border-color: #dde1e6;
  cursor: not-allowed;
  box-shadow: none;
}

.category-card.has-records:not(.disabled):hover {
  border-color: #3f8b58;
  box-shadow: 0 2px 8px rgba(36, 80, 50, 0.12);
}

.category-card.no-records:not(.disabled):hover {
  border-color: #8a939c;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}

.category-card.has-records.selected {
  background-color: #c2dfca;
  border-color: #3f8b58;
  border-width: 2px;
  box-shadow: 0 2px 10px rgba(36, 80, 50, 0.14);
  z-index: 1;
}

.category-card.no-records.selected {
  background-color: #dde1e5;
  border-color: #8a939c;
  border-width: 2px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.1);
  z-index: 1;
}

.category-card.disabled.selected {
  border-color: #9aa3ad;
  border-width: 2px;
}

.card-check {
  position: absolute;
  top: 4px;
  right: 5px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.category-card.has-records .card-check {
  background: #3f8b58;
}

.category-card.no-records .card-check {
  background: #8a939c;
}

.category-card.disabled .card-check {
  background: #9aa3ad;
}

.card-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.category-card.has-records .card-icon {
  background: rgba(36, 80, 50, 0.14);
}

.category-card.no-records .card-icon {
  background: rgba(90, 101, 112, 0.1);
}

.category-card.disabled .card-icon {
  background: rgba(154, 163, 173, 0.12);
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
