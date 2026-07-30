<template>
  <div class="landing-mode-cards" role="radiogroup" aria-label="查询方式">
    <button
      v-for="opt in LANDING_MODE_OPTIONS"
      :key="opt.code"
      type="button"
      class="landing-mode-card"
      :class="{ selected: modelValue === opt.code }"
      :style="cardStyle(opt)"
      role="radio"
      :aria-checked="modelValue === opt.code"
      @click="select(opt.code)"
    >
      <span class="card-icon">{{ opt.icon }}</span>
      <span class="card-label">{{ opt.label }}</span>
      <span v-if="modelValue === opt.code" class="card-check" aria-hidden="true">✓</span>
    </button>
  </div>
</template>

<script setup>
const LANDING_MODE_OPTIONS = [
  { code: 'norm', label: '规范', icon: '规', bg: '#4472C4', text: '#fff' },
  { code: 'qa', label: '答疑', icon: '答', bg: '#70AD47', text: '#fff' },
  { code: 'aggregate', label: '聚合查询', icon: '聚', bg: '#4F46E5', text: '#fff' },
];

defineProps({
  modelValue: { type: String, default: 'aggregate' },
});

const emit = defineEmits(['update:modelValue', 'change']);

function cardStyle(opt) {
  return { '--card-bg': opt.bg, '--card-text': opt.text || '#fff' };
}

function select(code) {
  emit('update:modelValue', code);
  emit('change', code);
}
</script>

<style scoped>
.landing-mode-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  max-width: 520px;
  width: 100%;
  margin: 0 auto;
}

.landing-mode-card {
  position: relative;
  border: 2px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  padding: 20px 12px 18px;
  background: var(--card-bg);
  color: var(--card-text);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 112px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;
}

.landing-mode-card:not(.selected) {
  opacity: 0.78;
  filter: saturate(0.75);
}

.landing-mode-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
  opacity: 1;
  filter: none;
}

.landing-mode-card.selected {
  border-color: #fff;
  box-shadow:
    0 0 0 3px rgba(15, 23, 42, 0.5),
    0 0 0 6px rgba(79, 70, 229, 0.45),
    0 10px 28px rgba(15, 23, 42, 0.22);
  transform: translateY(-3px) scale(1.02);
  opacity: 1;
  filter: none;
}

.card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.card-label {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.25;
  text-align: center;
}

.card-check {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: #4f46e5;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

@media (max-width: 560px) {
  .landing-mode-cards {
    grid-template-columns: 1fr;
    max-width: 280px;
  }

  .landing-mode-card {
    min-height: 88px;
    flex-direction: row;
    justify-content: flex-start;
    padding: 14px 16px;
    gap: 14px;
  }

  .card-icon {
    width: 40px;
    height: 40px;
    font-size: 16px;
  }
}
</style>
