<template>
  <div class="landing-mode-tabs" role="radiogroup" aria-label="查询方式">
    <button
      v-for="opt in LANDING_MODE_OPTIONS"
      :key="opt.code"
      type="button"
      class="landing-mode-tab"
      :class="{ selected: modelValue === opt.code }"
      role="radio"
      :aria-checked="modelValue === opt.code"
      @click="select(opt.code)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup>
const LANDING_MODE_OPTIONS = [
  { code: 'norm', label: '查规范' },
  { code: 'qa', label: '查答疑' },
  { code: 'aggregate', label: '按模块查询' },
];

defineProps({
  modelValue: { type: String, default: 'aggregate' },
});

const emit = defineEmits(['update:modelValue', 'change']);

function select(code) {
  emit('update:modelValue', code);
  emit('change', code);
}
</script>

<style scoped>
.landing-mode-tabs {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  margin: 0 auto 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-card);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.landing-mode-tab {
  padding: 10px 22px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.25;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.landing-mode-tab:hover:not(.selected) {
  color: var(--text);
}

.landing-mode-tab.selected {
  background: #1a1a1a;
  color: #fff;
  font-weight: 600;
}

@media (max-width: 560px) {
  .landing-mode-tabs {
    width: 100%;
    max-width: 100%;
    border-radius: var(--radius-lg);
    padding: 4px;
  }

  .landing-mode-tab {
    flex: 1 1 auto;
    padding: 10px 12px;
    font-size: 13px;
  }
}
</style>
