<template>
  <div class="wf-zoom-bar" role="toolbar" aria-label="预览缩放">
    <button
      type="button"
      class="wf-zoom-btn"
      :disabled="modelValue <= min"
      aria-label="缩小"
      @click="zoomOut"
    >
      −
    </button>
    <span class="wf-zoom-label">{{ modelValue }}%</span>
    <button
      type="button"
      class="wf-zoom-btn"
      :disabled="modelValue >= max"
      aria-label="放大"
      @click="zoomIn"
    >
      +
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Number, default: 100 },
  min: { type: Number, default: 50 },
  max: { type: Number, default: 200 },
  step: { type: Number, default: 10 },
});

const emit = defineEmits(['update:modelValue']);

function clamp(value) {
  return Math.min(props.max, Math.max(props.min, value));
}

function zoomIn() {
  emit('update:modelValue', clamp(props.modelValue + props.step));
}

function zoomOut() {
  emit('update:modelValue', clamp(props.modelValue - props.step));
}
</script>

<style scoped>
.wf-zoom-bar {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--border, #d0d7de);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12);
  pointer-events: auto;
}

.wf-zoom-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text, #1f2328);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wf-zoom-btn:hover:not(:disabled) {
  background: var(--bg-hover, #eef1f4);
}

.wf-zoom-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.wf-zoom-label {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary, #57606a);
  user-select: none;
}
</style>
