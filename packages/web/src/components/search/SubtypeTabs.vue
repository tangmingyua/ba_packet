<template>
  <div v-if="options.length" class="subtype-tabs-wrap">
    <div class="qa-sheet-tabs subtype-tabs" role="tablist" aria-label="子类选择">
      <button
        v-for="item in options"
        :key="item.code"
        type="button"
        class="qa-sheet-tab"
        role="tab"
        :class="{ active: modelValue === item.code }"
        :aria-selected="modelValue === item.code"
        @click="select(item.code)"
      >
        {{ item.name }} ({{ item.count }})
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue', 'change']);

function select(code) {
  emit('update:modelValue', code);
  emit('change', code);
}
</script>

<style scoped>
.subtype-tabs {
  margin-bottom: 0;
}
</style>
