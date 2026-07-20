<template>
  <div
    ref="rootRef"
    class="cell-content"
    :class="{
      'cell-desc-wrap': isDesc,
      'cell-desc': isDesc,
      'is-active': active,
      'has-overflow': hasOverflow,
    }"
    @click.stop="onClick"
  >
    <div ref="clampRef" class="cell-text-clamp">
      <span v-if="html" :class="{ 'cell-desc': isDesc }" v-html="html" />
      <span v-else :class="{ 'cell-desc': isDesc }">{{ displayText }}</span>
    </div>
    <span v-if="hasOverflow" class="truncate-indicator" aria-hidden="true">
      <span class="truncate-overflow">...>></span>
    </span>
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
    el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
}

function onClick(event) {
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
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  line-height: 1.55;
  max-height: 48px;
}

.cell-content.has-overflow {
  cursor: pointer;
}

.truncate-indicator {
  position: absolute;
  right: 0;
  bottom: 0;
  padding-left: 28px;
  background: linear-gradient(to right, transparent, var(--bg-card) 55%);
  line-height: 1.55;
  pointer-events: none;
}

.cell-copy-btn-static {
  opacity: 0;
}

.cell-content:hover .cell-copy-btn-static {
  opacity: 1;
}
</style>
