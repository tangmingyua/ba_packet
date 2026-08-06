<template>
  <div
    ref="rootRef"
    class="cell-content"
    :class="{
      'cell-desc-wrap': isDesc,
      'cell-desc': isDesc,
      'is-active': active,
      'has-overflow': hasOverflow,
      'is-passive': passive,
    }"
    :title="!passive && hasOverflow && text ? text : undefined"
    :aria-label="!passive && hasOverflow && text ? '点击查看全文' : undefined"
    @click="onClick"
  >
    <div ref="clampRef" class="cell-text-clamp">
      <span v-if="html" :class="{ 'cell-desc': isDesc }" v-html="html" />
      <span v-else :class="{ 'cell-desc': isDesc }">{{ displayText }}</span>
    </div>
    <span v-if="hasOverflow" class="cell-expand-hint">展开</span>
    <button
      v-if="isDesc && text && !hasOverflow"
      type="button"
      class="cell-copy-btn cell-copy-btn-static"
      @click.stop="emit('copy')"
    >
      复制
    </button>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
  text: { type: String, default: '' },
  html: { type: String, default: '' },
  isDesc: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  /** 仅展示省略与提示，不响应点击展开（由外层如链接按钮处理点击） */
  passive: { type: Boolean, default: false },
});

const emit = defineEmits(['expand', 'copy']);

const rootRef = ref(null);
const clampRef = ref(null);
const hasOverflow = ref(false);
let resizeObserver = null;

const displayText = computed(() => props.text || '—');

function checkOverflow() {
  const el = clampRef.value;
  if (!el) {
    hasOverflow.value = false;
    return;
  }
  hasOverflow.value =
    el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
}

function onClick(event) {
  if (props.passive) return;
  event.stopPropagation();
  if (hasOverflow.value) {
    emit('expand', event);
  }
}

watch(
  () => [props.text, props.html],
  async () => {
    await nextTick();
    checkOverflow();
  }
);

onMounted(async () => {
  await nextTick();
  checkOverflow();
  if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
    resizeObserver = new ResizeObserver(() => checkOverflow());
    resizeObserver.observe(rootRef.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

defineExpose({ checkOverflow });
</script>

<style scoped>
.cell-text-clamp {
  display: block;
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: normal;
  line-height: 1.55;
}

.cell-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--result-cell-inner-h, 26px);
  max-height: var(--result-cell-inner-h, 26px);
  overflow: hidden;
  word-break: normal;
  text-align: left;
  line-height: 1.55;
  color: var(--text);
  min-width: 0;
  max-width: 100%;
}

.cell-content.has-overflow {
  cursor: pointer;
}

.cell-content.is-passive.has-overflow {
  cursor: inherit;
}

.cell-content.is-passive.has-overflow:hover {
  color: inherit;
}

.cell-content.is-passive.has-overflow:hover .cell-desc {
  color: var(--accent-blue);
}

.cell-content.has-overflow:not(.is-passive):hover {
  color: var(--accent-blue);
}

.cell-content.has-overflow:hover .cell-desc {
  color: var(--accent-blue);
}

.cell-expand-hint {
  flex: 0 0 auto;
  font-size: 11px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--accent-blue);
  background: rgba(37, 99, 235, 0.08);
  opacity: 0.72;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.cell-content.has-overflow:hover .cell-expand-hint {
  opacity: 1;
}

.cell-copy-btn-static {
  opacity: 0;
}

.cell-content:hover .cell-copy-btn-static {
  opacity: 1;
}
</style>
